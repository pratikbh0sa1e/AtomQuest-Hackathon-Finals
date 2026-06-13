/**
 * Property 20: `active_sessions_total` gauge reflects actual active session count
 * Validates: Requirements 9.2
 *
 * Tests the pure filtering/counting logic used to compute the gauge value.
 * The gauge value should equal the exact count of sessions whose status is 'active'.
 * No Prometheus client is involved — we test the counting function directly.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure logic under test
// ---------------------------------------------------------------------------

/**
 * Counts sessions with status === 'active'.
 * This is the pure function whose result is fed into activeSessionsGauge.set().
 * @param {Array<{ status: string }>} sessions
 * @returns {number}
 */
function countActiveSessions(sessions) {
  return sessions.filter((s) => s.status === "active").length;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const SESSION_STATUSES = ["pending", "active", "ended"];

/** Generates a single session object with one of the three canonical statuses */
const sessionArb = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom(...SESSION_STATUSES),
});

/** Generates an array of 0–100 sessions with mixed statuses */
const sessionListArb = fc.array(sessionArb, { minLength: 0, maxLength: 100 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property 20 – active_sessions_total gauge reflects actual active session count", () => {
  /**
   * Property 20a: For any list of sessions, the gauge value equals the number
   * of sessions with status === 'active' — counting is exact with no
   * off-by-one or rounding errors.
   */
  it("20a: gauge value equals exact count of active sessions", () => {
    fc.assert(
      fc.property(sessionListArb, (sessions) => {
        const gaugeValue = countActiveSessions(sessions);
        const expected = sessions.filter((s) => s.status === "active").length;
        expect(gaugeValue).toBe(expected);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 20b: Non-active statuses ('pending', 'ended') are never counted.
   * Generating a list that contains ZERO active sessions must yield 0.
   */
  it("20b: sessions with non-active status do not contribute to the gauge", () => {
    const nonActiveSessionArb = fc.record({
      id: fc.uuid(),
      status: fc.constantFrom("pending", "ended"),
    });
    const nonActiveListArb = fc.array(nonActiveSessionArb, {
      minLength: 0,
      maxLength: 100,
    });

    fc.assert(
      fc.property(nonActiveListArb, (sessions) => {
        expect(countActiveSessions(sessions)).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 20c: A list of N all-active sessions yields exactly N.
   */
  it("20c: all-active list yields count equal to list length", () => {
    const allActiveListArb = fc.integer({ min: 0, max: 100 }).chain((n) =>
      fc.array(fc.record({ id: fc.uuid(), status: fc.constant("active") }), {
        minLength: n,
        maxLength: n,
      }),
    );

    fc.assert(
      fc.property(allActiveListArb, (sessions) => {
        expect(countActiveSessions(sessions)).toBe(sessions.length);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 20d: Adding one active session to any list increments the gauge
   * value by exactly 1.
   */
  it("20d: adding one active session increments the gauge by exactly 1", () => {
    fc.assert(
      fc.property(sessionListArb, (sessions) => {
        const before = countActiveSessions(sessions);
        const after = countActiveSessions([
          ...sessions,
          { id: "new-session", status: "active" },
        ]);
        expect(after).toBe(before + 1);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 20e: Adding one non-active session leaves the gauge value unchanged.
   */
  it("20e: adding a non-active session does not change the gauge value", () => {
    const nonActiveStatusArb = fc.constantFrom("pending", "ended");

    fc.assert(
      fc.property(sessionListArb, nonActiveStatusArb, (sessions, status) => {
        const before = countActiveSessions(sessions);
        const after = countActiveSessions([
          ...sessions,
          { id: "extra-session", status },
        ]);
        expect(after).toBe(before);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Edge case: empty session list yields gauge value of 0.
   */
  it("empty session list yields gauge value of 0", () => {
    expect(countActiveSessions([])).toBe(0);
  });

  /**
   * Edge case: single active session yields 1.
   */
  it("single active session yields 1", () => {
    expect(countActiveSessions([{ id: "s1", status: "active" }])).toBe(1);
  });

  /**
   * Edge case: mixed statuses — only active ones are counted.
   */
  it("mixed statuses — only active ones counted", () => {
    const sessions = [
      { id: "s1", status: "pending" },
      { id: "s2", status: "active" },
      { id: "s3", status: "active" },
      { id: "s4", status: "ended" },
    ];
    expect(countActiveSessions(sessions)).toBe(2);
  });
});
