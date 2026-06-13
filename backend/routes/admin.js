import { Router } from "express";
import { db } from "../supabase.js";
import { closeSession } from "../mediasoup-worker.js";

const router = Router();

/**
 * GET /admin/sessions
 * Agent only (admin monitoring).
 * Returns list of active sessions with duration and attendee details.
 * Requirements: 8.1
 */
router.get("/sessions", async (req, res) => {
  try {
    const { data: sessions, error } = await db
      .from("sessions")
      .select("*, participants(*)")
      .eq("status", "active");

    if (error) {
      console.error("[GET /admin/sessions] DB query error:", error);
      return res.status(500).json({ error: "Failed to query active sessions", code: "QUERY_FAILED" });
    }

    const summaries = (sessions ?? []).map((session) => {
      const activeParticipants = session.participants?.filter((p) => p.left_at === null) ?? [];
      const agentPart = activeParticipants.find((p) => p.role === "agent");
      const customerPart = activeParticipants.find((p) => p.role === "customer");

      //Connected duration in seconds
      const joinedTime = activeParticipants[0]?.joined_at || session.created_at;
      const duration = Math.floor((Date.now() - new Date(joinedTime).getTime()) / 1000);

      return {
        id: session.id,
        status: session.status,
        agent: agentPart ? agentPart.name : "None",
        customer: customerPart ? customerPart.name : "Connecting...",
        duration: duration > 0 ? duration : 0,
        invite_token: session.invite_token,
        participants_count: activeParticipants.length,
      };
    });

    return res.json(summaries);
  } catch (err) {
    console.error("[GET /admin/sessions] exception:", err);
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /admin/sessions/:id/end
 * Agent only. Forcibly terminates a session, closing SFU transports and disconnecting sockets.
 * Requirements: 8.2, 8.3, 8.6
 */
router.post("/sessions/:id/end", async (req, res) => {
  const { id: sessionId } = req.params;
  const io = req.app.get("io");

  try {
    // 1. Verify if session exists
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("status")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
    }

    const room = `session:${sessionId}`;

    // 2. Emit termination event BEFORE closing connections (Requirement 8.6)
    if (io) {
      io.to(room).emit("session-terminated");
    }

    // 3. Atomically close all SFU transports (Requirement 8.2)
    try {
      closeSession(sessionId);
    } catch (sfuErr) {
      console.error(`[admin] SFU closeSession failed for ${sessionId}:`, sfuErr);
      // Non-blocking: proceed with socket and DB teardowns
    }

    // 4. Disconnect all sockets in that room (Requirement 8.2)
    if (io) {
      io.in(room).disconnectSockets(true);
    }

    // 5. Update session in DB
    const now = new Date().toISOString();
    
    // Update session status to ended
    await db
      .from("sessions")
      .update({ status: "ended", ended_at: now })
      .eq("id", sessionId);

    // Update active participants left times and duration
    const { data: participants } = await db
      .from("participants")
      .select("*")
      .eq("session_id", sessionId)
      .is("left_at", null);

    if (participants && participants.length > 0) {
      const updates = participants.map((p) => {
        const duration = p.joined_at
          ? Math.floor((Date.now() - new Date(p.joined_at).getTime()) / 1000)
          : 0;

        return db
          .from("participants")
          .update({
            duration,
            left_at: now,
            connection_status: "disconnected",
          })
          .eq("id", p.id);
      });
      await Promise.all(updates);
    }

    console.log(`[admin] Session ${sessionId} forcibly terminated by admin.`);
    return res.status(200).json({ message: "Session forcibly ended successfully" });

  } catch (err) {
    console.error("[POST /admin/sessions/:id/end] error:", err);
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
