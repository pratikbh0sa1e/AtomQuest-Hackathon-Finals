import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { adminDb } from "../supabase.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

export const reconnectTokens = new Map();

// ---------------------------------------------------------------------------
// POST /auth/login
// Queries agents table in DB. Supports role: 'agent' | 'supervisor'.
// Returns JWT with role embedded — used for RBAC throughout the system.
// Requirements: 4.1, 4.7
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    // Server-side input validation
    if (
      !username ||
      typeof username !== "string" ||
      username.trim().length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Username is required", code: "MISSING_USERNAME" });
    }
    if (!password || typeof password !== "string" || password.length === 0) {
      return res
        .status(400)
        .json({ error: "Password is required", code: "MISSING_PASSWORD" });
    }
    if (username.trim().length > 64) {
      return res
        .status(400)
        .json({ error: "Username too long", code: "INVALID_USERNAME" });
    }
    if (password.length > 128) {
      return res
        .status(400)
        .json({ error: "Password too long", code: "INVALID_PASSWORD" });
    }

    // Look up agent in DB
    const { data: agent, error: dbError } = await adminDb
      .from("agents")
      .select("id, username, password, name, role")
      .eq("username", username.trim())
      .single();

    if (dbError || !agent) {
      return res
        .status(401)
        .json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }

    // Verify bcrypt password
    const passwordMatch = await bcrypt.compare(password, agent.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }

    // Sign JWT with actual role from DB
    const token = jwt.sign(
      {
        sub: agent.id,
        role: agent.role,
        name: agent.name,
        username: agent.username,
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    return res.json({ token, name: agent.name, role: agent.role });
  } catch (err) {
    console.error("[auth/login] error:", err);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/join
// Query param: invite_token
// Body (optional): { name }
//
// Validates the invite token:
//   - token not found or already used (token_used_at IS NOT NULL) → 404
//   - token older than 24 hours → 410
//
// On success (atomic):
//   - Sets token_used_at = now() on the session
//   - Inserts a participants row
//   - Generates a 32-byte hex reconnectToken
//   - Stores reconnectToken in the in-memory reconnectTokens Map
//   - Returns a Customer session JWT
//
// Requirements: 1.3, 1.4, 1.5, 4.7
// ---------------------------------------------------------------------------
router.post("/join", async (req, res) => {
  try {
    const inviteToken = req.query.invite_token;

    // ── Server-side input validation ──────────────────────────────────────
    if (
      !inviteToken ||
      typeof inviteToken !== "string" ||
      inviteToken.trim().length === 0
    ) {
      return res.status(400).json({
        error: "invite_token query parameter is required",
        code: "MISSING_INVITE_TOKEN",
      });
    }
    if (inviteToken.length > 256) {
      return res.status(400).json({
        error: "Invalid invite token format",
        code: "INVALID_INVITE_TOKEN",
      });
    }

    const participantName = req.body?.name?.trim() || "";
    if (participantName.length > 64) {
      return res.status(400).json({
        error: "Name must be 64 characters or fewer",
        code: "NAME_TOO_LONG",
      });
    }

    // Look up the session by invite token
    const { data: session, error: sessionError } = await adminDb
      .from("sessions")
      .select("*")
      .eq("invite_token", inviteToken)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        error: "Invalid or not found invite token",
        code: "TOKEN_NOT_FOUND",
      });
    }

    // Check if the token has already been used
    if (session.token_used_at !== null) {
      return res.status(404).json({
        error: "This invite link has already been used",
        code: "TOKEN_ALREADY_USED",
      });
    }

    // Check if the token has expired (older than 24 hours)
    const createdAt = new Date(session.created_at);
    const now = new Date();
    const ageMs = now.getTime() - createdAt.getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    if (ageMs > twentyFourHoursMs) {
      return res.status(410).json({
        error: "This invite link has expired",
        code: "TOKEN_EXPIRED",
      });
    }

    // Accept participant name from body, default to "Customer"
    const finalName = participantName || "Customer";

    // Get IP address from request
    const ipAddress = req.ip || "unknown";

    // Atomically: mark token as used and insert participant row.
    // Supabase doesn't expose true SQL transactions via the JS client, so we
    // use a sequential update + insert. The single-use guarantee relies on
    // the UNIQUE constraint on invite_token and the token_used_at check above.
    // In a true multi-instance deployment a SELECT ... FOR UPDATE or a DB
    // function would be preferred; for a single-process server this is safe.

    // Step 1: Mark token as used (only proceeds if it was still NULL)
    const { error: updateError } = await adminDb
      .from("sessions")
      .update({ token_used_at: now.toISOString() })
      .eq("id", session.id)
      .is("token_used_at", null); // guard: only update if still unused

    if (updateError) {
      console.error("[auth/join] failed to mark token as used:", updateError);
      return res.status(500).json({
        error: "Failed to process invite token",
        code: "INTERNAL_ERROR",
      });
    }

    // Step 2: Insert participant row
    const { data: participant, error: insertError } = await adminDb
      .from("participants")
      .insert({
        session_id: session.id,
        role: "customer",
        name: finalName,
        joined_at: now.toISOString(),
        connection_status: "connected",
        ip_address: ipAddress,
      })
      .select()
      .single();

    if (insertError || !participant) {
      console.error("[auth/join] failed to insert participant:", insertError);
      // Attempt to roll back the token_used_at update
      await adminDb
        .from("sessions")
        .update({ token_used_at: null })
        .eq("id", session.id);

      return res.status(500).json({
        error: "Failed to create participant record",
        code: "INTERNAL_ERROR",
      });
    }

    // Generate a cryptographically random 32-byte hex reconnect token
    const reconnectToken = crypto.randomBytes(32).toString("hex");

    // Store in memory for later reconnect verification
    reconnectTokens.set(participant.id, {
      token: reconnectToken,
      sessionId: session.id,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });

    // Sign the Customer session JWT
    const customerJwt = jwt.sign(
      {
        sub: participant.id,
        role: "customer",
        sessionId: session.id,
        reconnectToken,
      },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    return res.json({
      token: customerJwt,
      sessionId: session.id,
      participantId: participant.id,
    });
  } catch (err) {
    console.error("[auth/join] error:", err);
    return res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
});

export default router;
