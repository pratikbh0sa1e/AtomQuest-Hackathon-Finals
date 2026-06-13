/**
 * Property-Based Test: Session history ordering and capping
 *
 * Property 6: Session history is sorted descending and capped at 1000
 * Validates: Requirements 1.7
 *
 * Tests the pure sorting/capping logic — not the DB layer.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure function that mirrors the GET /sessions query logic:
 * - Sorts sessions in descending order of created_at
 * - Returns at most 1000 records
 *
 * @param {Array<{ id: string, created_at: Date }>} sessions
 * @returns {Array<{ id: string, created_at: Date }>}
 */
function getSessionHistory(sessions) {
  return [...sessions]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Use fc.integer mapped to Date to guarantee valid (non-NaN) timestamps.
// fc.date() can produce new Date(NaN) during shrinking even with min/max bounds.
const MAX_TS = 2_000_000_000_000; // ~2033-05-18

const validDateArb = fc
  .integer({ min: 0, max: MAX_TS })
  .map((ms) => new Date(ms));

const sessionArb = fc.record({
  id: fc.uuid(),
  created_at: validDateArb,
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("getSessionHistory — Property 6: sorted DESC, capped at 1000", () => {
  /**
   * Property 6a: Result length is always ≤ 1000 regardless of input size.
   * **Validates: Requirements 1.7**
   */
  it("result.length <= 1000 for any input (0–1500 records)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 1500 }),
        (sessions) => {
          const result = getSessionHistory(sessions);
          expect(result.length).toBeLessThanOrEqual(1000);
        },
      ),
    );
  });

  /**
   * Property 6b: Result is in descending order of created_at (ties allowed).
   * **Validates: Requirements 1.7**
   */
  it("result is in descending order of created_at (as timestamps)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 1500 }),
        (sessions) => {
          const result = getSessionHistory(sessions);

          // For every consecutive pair, the earlier element must be >= later (DESC)
          for (let i = 0; i < result.length - 1; i++) {
            const current = result[i].created_at.getTime();
            const next = result[i + 1].created_at.getTime();
            expect(current).toBeGreaterThanOrEqual(next);
          }
        },
      ),
    );
  });

  /**
   * Property 6c: When input has more than 1000 records, the 1000 most recent
   * are returned (not arbitrarily truncated from the front).
   * **Validates: Requirements 1.7**
   */
  it("returns the 1000 most recent sessions when input exceeds 1000", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1001, max: 1500 })
          .chain((n) => fc.array(sessionArb, { minLength: n, maxLength: n })),
        (sessions) => {
          const result = getSessionHistory(sessions);

          // Must be exactly 1000
          expect(result.length).toBe(1000);

          // The minimum timestamp in the result must be >= the minimum of the
          // top-1000 by timestamp in the original input.
          const allSorted = [...sessions].sort(
            (a, b) => b.created_at.getTime() - a.created_at.getTime(),
          );
          const top1000MinTs = allSorted[999].created_at.getTime();
          const resultMinTs = result.reduce(
            (min, s) => Math.min(min, s.created_at.getTime()),
            Infinity,
          );
          expect(resultMinTs).toBeGreaterThanOrEqual(top1000MinTs);
        },
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns empty array for empty input", () => {
    expect(getSessionHistory([])).toEqual([]);
  });

  it("returns single-element array unchanged", () => {
    const session = { id: "abc", created_at: new Date("2024-01-01T00:00:00Z") };
    const result = getSessionHistory([session]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc");
  });
});
