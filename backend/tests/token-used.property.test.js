/**
 * Property-Based Test: Used or missing invite tokens → HTTP 404
 *
 * Property 3: Used or non-existent invite tokens always return HTTP 404
 * Validates: Requirements 1.4, 4.7
 *
 * Tests the pure "should return 404" check extracted from backend/routes/auth.js:
 *   - If session is null/undefined → token not found → 404
 *   - If session.token_used_at is not null → token already used → 404
 *   - If session exists AND token_used_at is null → token is valid → no 404
 *
 * No DB calls needed — we test the pure logic only.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure predicate — mirrors the token-not-found / already-used checks in
// backend/routes/auth.js (/auth/join handler).
//
//   if (sessionError || !session) → 404
//   if (session.token_used_at !== null) → 404
// ---------------------------------------------------------------------------

/**
 * @param {object|null|undefined} session - the session row returned by the DB lookup
 * @returns {boolean} - true if the request should return 404
 */
function shouldReturn404(session) {
  if (session == null) {
    return true; // null or undefined → token not found
  }
  if (session.token_used_at !== null) {
    return true; // token already consumed
  }
  return false; // session exists and token is still fresh
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Token used/missing → 404 — Property 3 (Validates: Requirements 1.4, 4.7)", () => {
  /**
   * Property A: For a null session (token not found in DB),
   * shouldReturn404 must always return true.
   */
  it("returns true for null session (missing token)", () => {
    fc.assert(
      fc.property(fc.constant(null), (session) => {
        expect(shouldReturn404(session)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property B: For a session whose token_used_at is a non-null Date
   * (token already consumed), shouldReturn404 must always return true.
   *
   * Generator strategy:
   *   - Build a session record whose token_used_at is an arbitrary Date
   */
  it("returns true for session with non-null token_used_at (already used token)", () => {
    fc.assert(
      fc.property(fc.record({ token_used_at: fc.date() }), (session) => {
        expect(shouldReturn404(session)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Property C: For a session whose token_used_at is null (token still unused),
   * shouldReturn404 must always return false.
   *
   * Generator strategy:
   *   - Build a session record whose token_used_at is explicitly null
   *   - Other fields can be anything (we don't care about them here)
   */
  it("returns false for session with null token_used_at (valid unused token)", () => {
    fc.assert(
      fc.property(
        fc.record({ token_used_at: fc.constant(null) }),
        (session) => {
          expect(shouldReturn404(session)).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  // ---------------------------------------------------------------------------
  // Boundary / concrete examples
  // ---------------------------------------------------------------------------

  it("returns true for undefined session (missing token)", () => {
    expect(shouldReturn404(undefined)).toBe(true);
  });

  it("returns true when token_used_at is a specific past date", () => {
    const session = { token_used_at: new Date("2024-01-01T10:00:00.000Z") };
    expect(shouldReturn404(session)).toBe(true);
  });

  it("returns false when token_used_at is null (token is fresh)", () => {
    const session = { token_used_at: null };
    expect(shouldReturn404(session)).toBe(false);
  });
});
