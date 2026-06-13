import { db } from "../supabase.js";

/**
 * Valid session status transitions (server-enforced).
 * Requirement 2.7: pending → active/ended, active → ended, ended → (none)
 */
export const VALID_TRANSITIONS = {
  pending: ["active", "ended"],
  active: ["ended"],
  ended: [],
};

/**
 * Checks whether transitioning from `from` to `to` is permitted.
 * @param {string} from - Current session status
 * @param {string} to   - Desired next status
 * @returns {boolean}
 */
export function validateTransition(from, to) {
  if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Express middleware factory.
 * Verifies the session identified by `req.params.id` exists and its
 * current status is one of `allowedStatuses`.
 *
 * On success: attaches the session row to `req.session` and calls `next()`.
 * On failure:
 *   - 404 if session is not found
 *   - 409 if session status is not in `allowedStatuses`
 *
 * @param {...string} allowedStatuses - One or more status values that are acceptable.
 * @returns {import('express').RequestHandler}
 */
export function requireSessionStatus(...allowedStatuses) {
  return async (req, res, next) => {
    const { id } = req.params;

    const { data: session, error } = await db
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !session) {
      return res.status(404).json({
        error: "Session not found",
        code: "SESSION_NOT_FOUND",
      });
    }

    if (!allowedStatuses.includes(session.status)) {
      return res.status(409).json({
        error: `Session status '${session.status}' is not allowed for this operation. Expected one of: ${allowedStatuses.join(", ")}`,
        code: "INVALID_SESSION_STATUS",
      });
    }

    req.session = session;
    next();
  };
}
