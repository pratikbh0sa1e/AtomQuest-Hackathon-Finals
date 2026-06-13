import { db } from "../supabase.js";

/**
 * Factory function returning an Express middleware that enforces role-based access control.
 * If the authenticated user's role does not match the required role:
 *   - Inserts an audit log entry capturing the unauthorized attempt
 *   - Returns HTTP 403 with a JSON error body
 *
 * @param {string} role - The required role (e.g. 'agent')
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return async function requireRoleMiddleware(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      try {
        await db.from("audit_log").insert({
          participant_id: req.user?.id ?? "unknown",
          session_id: req.params?.id ?? req.params?.sessionId ?? null,
          action: `${req.method} ${req.path}`,
          ip_address: req.ip ?? null,
        });
      } catch (auditErr) {
        console.error(
          "[requireRole] Failed to insert audit_log entry:",
          auditErr,
        );
      }

      return res.status(403).json({
        error: "Forbidden — insufficient role",
        code: "FORBIDDEN",
      });
    }

    next();
  };
}
