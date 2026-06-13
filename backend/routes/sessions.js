import { Router } from "express";
import { db } from "../supabase.js";
import { validateTransition } from "../middleware/sessionStatus.js";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * POST /sessions
 * Agent only. Creates a new session with status 'pending' and a unique invite token.
 * Returns { id, invite_token, invite_url }.
 * Requirements: 1.1
 */
router.post("/", async (req, res) => {
  try {
    const invite_token = crypto.randomUUID();
    const invite_url = `${FRONTEND_URL}/join?token=${invite_token}`;

    const { data: session, error } = await db
      .from("sessions")
      .insert({ invite_token, status: "pending" })
      .select("id, invite_token")
      .single();

    if (error || !session) {
      console.error("[POST /sessions] DB insert error:", error);
      return res.status(500).json({
        error: "Failed to create session",
        code: "SESSION_CREATE_FAILED",
      });
    }

    return res.status(201).json({
      id: session.id,
      invite_token: session.invite_token,
      invite_url,
    });
  } catch (err) {
    console.error("[POST /sessions] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /sessions
 * Agent only. Returns the most recent 1000 sessions DESC by created_at,
 * joined with participants data.
 * Requirements: 1.7
 */
router.get("/", async (req, res) => {
  // Authentication is enforced by the middleware chain in server.js.
  // If we reach here, req.user is set. The 401 check is therefore redundant,
  // but we guard for belt-and-suspenders in case middleware is misconfigured.
  if (!req.user) {
    return res
      .status(401)
      .json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }

  try {
    const { data: sessions, error } = await db
      .from("sessions")
      .select("*, participants(*), recordings(*)")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[GET /sessions] DB query error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch sessions", code: "FETCH_FAILED" });
    }

    return res.json(sessions ?? []);
  } catch (err) {
    console.error("[GET /sessions] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /sessions/:id
 * Agent only. Returns a single session with participants and message count.
 * Requirements: 1.8
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: session, error } = await db
      .from("sessions")
      .select(
        `
        id,
        status,
        invite_token,
        token_used_at,
        created_at,
        ended_at,
        ai_transcript,
        ai_summary,
        participants (
          id,
          role,
          name,
          joined_at,
          left_at,
          duration,
          connection_status,
          ip_address
        ),
        messages (count)
        `,
      )
      .eq("id", id)
      .single();

    if (error || !session) {
      return res
        .status(404)
        .json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
    }

    // Flatten the messages count from the array shape Supabase returns
    const messages_count = Array.isArray(session.messages)
      ? (session.messages[0]?.count ?? 0)
      : 0;

    return res.json({ ...session, messages_count, messages: undefined });
  } catch (err) {
    console.error("[GET /sessions/:id] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * PATCH /sessions/:id/status
 * Agent only. Validates the status transition using validateTransition.
 * On transition to 'ended': computes participant durations and sets ended_at.
 * Returns 409 on invalid transition.
 * Requirements: 1.6, 2.7
 */
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status: newStatus } = req.body;

  if (!newStatus) {
    return res.status(400).json({
      error: "Missing 'status' in request body",
      code: "MISSING_STATUS",
    });
  }

  try {
    // Fetch current session
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("id, status")
      .eq("id", id)
      .single();

    if (fetchError || !session) {
      return res
        .status(404)
        .json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
    }

    const currentStatus = session.status;

    // Validate the transition
    if (!validateTransition(currentStatus, newStatus)) {
      return res.status(409).json({
        error: `Invalid status transition: '${currentStatus}' → '${newStatus}'`,
        code: "INVALID_TRANSITION",
      });
    }

    const now = new Date().toISOString();

    // If transitioning to 'ended', compute each participant's duration
    if (newStatus === "ended") {
      const { data: participants, error: participantsError } = await db
        .from("participants")
        .select("id, joined_at")
        .eq("session_id", id);

      if (participantsError) {
        console.error(
          "[PATCH /sessions/:id/status] Failed to fetch participants:",
          participantsError,
        );
        return res.status(500).json({
          error: "Failed to fetch participants",
          code: "FETCH_FAILED",
        });
      }

      const endedAtMs = Date.now();

      // Update duration for each participant in parallel
      if (participants && participants.length > 0) {
        const updates = participants.map((p) => {
          const duration = p.joined_at
            ? Math.floor((endedAtMs - new Date(p.joined_at).getTime()) / 1000)
            : 0;

          return db
            .from("participants")
            .update({ duration, left_at: now })
            .eq("id", p.id);
        });

        const results = await Promise.all(updates);
        for (const { error: updateError } of results) {
          if (updateError) {
            console.error(
              "[PATCH /sessions/:id/status] Participant update error:",
              updateError,
            );
            // Non-fatal: log but continue — session end must still proceed
          }
        }
      }
    }

    // Update session status (and ended_at if ending)
    const sessionUpdate =
      newStatus === "ended"
        ? { status: newStatus, ended_at: now }
        : { status: newStatus };

    const { data: updatedSession, error: updateError } = await db
      .from("sessions")
      .update(sessionUpdate)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedSession) {
      console.error(
        "[PATCH /sessions/:id/status] Session update error:",
        updateError,
      );
      return res.status(500).json({
        error: "Failed to update session status",
        code: "UPDATE_FAILED",
      });
    }

    return res.json(updatedSession);
  } catch (err) {
    console.error("[PATCH /sessions/:id/status] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /sessions/:id/messages
 * Agent only. Returns all messages for a session ordered by created_at ASC.
 */
router.get("/:id/messages", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: messages, error } = await db
      .from("messages")
      .select("*")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /sessions/:id/messages] DB query error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch messages", code: "FETCH_FAILED" });
    }

    return res.json(messages ?? []);
  } catch (err) {
    console.error("[GET /sessions/:id/messages] Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
