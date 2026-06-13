import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Authentication middleware.
 *
 * Tries two authentication paths in order:
 *   1. `Authorization: Bearer <jwt>` — used by agents (and customers who already have a session JWT)
 *   2. `x-invite-token: <token>`     — used during the customer join flow before a session JWT exists
 *
 * On success:  sets `req.user = { role, id, sessionId }` and calls `next()`.
 * On failure:  returns HTTP 401 JSON `{ error, code }`.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function authenticate(req, res, next) {
  // --- Path 1: JWT via Authorization header ---
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        // Normalise payload fields into a consistent shape.
        // Agent JWT shape:   { sub, role }
        // Customer JWT shape: { sub, role, sessionId }
        req.user = {
          role: payload.role,
          id: payload.sub,
          sessionId: payload.sessionId ?? null,
        };
        return next();
      } catch {
        return res.status(401).json({
          error: "Invalid or expired token",
          code: "INVALID_TOKEN",
        });
      }
    }
  }

  // --- Path 2: Invite-token header (customer join flow) ---
  const inviteToken = req.headers["x-invite-token"];
  if (inviteToken) {
    // The invite token itself is NOT a JWT — it is a raw opaque string stored
    // in the sessions table. We do not verify it here; we just attach it to
    // req.user so downstream route handlers (POST /auth/join) can look it up
    // in the database and perform single-use / expiry checks there.
    req.user = {
      role: "customer",
      id: null, // not known yet — assigned after DB lookup in /auth/join
      sessionId: null, // not known yet
      inviteToken, // forwarded for the join route to validate
    };
    return next();
  }

  // --- Neither header present ---
  return res.status(401).json({
    error: "Authentication required",
    code: "MISSING_AUTH",
  });
}
