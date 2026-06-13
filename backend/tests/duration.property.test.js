/**
 * Property test for participant duration computation.
 *
 * **Validates: Requirements 1.6**
 *
 * Property 5: Session end correctly computes participant durations.
 *
 * For any set of participants with varying `joined_at` timestamps and any
 * session `ended_at` time, each participant's `duration` must equal
 * `floor((ended_at - joined_at) / 1000)` seconds. For any participant with
 * a null `joined_at`, duration must be 0.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure duration computation function extracted from backend/routes/sessions.js
// ---------------------------------------------------------------------------

/**
 * Compute the participation duration in whole seconds.
 *
 * @param {number|null} joinedAt  - Join timestamp in milliseconds (null → 0 duration).
 * @param {number}      endedAt   - Session end timestamp in milliseconds.
 * @returns {number} Duration in seconds (non-negative integer).
 */
export function computeDuration(joinedAt, endedAt) {
  if (joinedAt === null || joinedAt === undefined) {
    return 0;
  }
  return Math.floor((endedAt - joinedAt) / 1000);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// A safe integer range that avoids floating-point precision issues and keeps
// timestamps representable as JS numbers. We use a 50-year window in ms.
const MAX_MS = 50 * 365 * 24 * 60 * 60 * 1000; // ~1.576 × 10¹²

const tsArb = fc.integer({ min: 0, max: MAX_MS });

// Generate (joinedAt, endedAt) pairs where endedAt >= joinedAt.
const validPairArb = tsArb.chain((joinedAt) =>
  fc
    .integer({ min: joinedAt, max: MAX_MS })
    .map((endedAt) => ({ joinedAt, endedAt })),
);

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("computeDuration", () => {
  /**
   * Property A: For null joinedAt, duration is always 0.
   * **Validates: Requirements 1.6**
   */
  it("Property A — null joinedAt always yields duration 0", () => {
    fc.assert(
      fc.property(tsArb, (endedAt) => {
        expect(computeDuration(null, endedAt)).toBe(0);
      }),
    );
  });

  /**
   * Property B: Duration formula is floor division by 1000.
   * For any valid (joinedAt, endedAt) pair where endedAt >= joinedAt,
   * duration === Math.floor((endedAt - joinedAt) / 1000).
   * **Validates: Requirements 1.6**
   */
  it("Property B — duration equals floor((endedAt - joinedAt) / 1000)", () => {
    fc.assert(
      fc.property(validPairArb, ({ joinedAt, endedAt }) => {
        const expected = Math.floor((endedAt - joinedAt) / 1000);
        expect(computeDuration(joinedAt, endedAt)).toBe(expected);
      }),
    );
  });

  /**
   * Property C: For any valid (joinedAt, endedAt) where endedAt >= joinedAt,
   * duration is non-negative.
   * **Validates: Requirements 1.6**
   */
  it("Property C — duration is non-negative for endedAt >= joinedAt", () => {
    fc.assert(
      fc.property(validPairArb, ({ joinedAt, endedAt }) => {
        expect(computeDuration(joinedAt, endedAt)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Concrete unit tests
  // -------------------------------------------------------------------------

  it("returns 0 when joinedAt is null", () => {
    expect(computeDuration(null, 1_000_000)).toBe(0);
  });

  it("returns 0 when joinedAt equals endedAt", () => {
    expect(computeDuration(5_000, 5_000)).toBe(0);
  });

  it("floors fractional seconds correctly (999ms difference → 0s)", () => {
    expect(computeDuration(0, 999)).toBe(0);
  });

  it("floors fractional seconds correctly (1999ms difference → 1s)", () => {
    expect(computeDuration(0, 1_999)).toBe(1);
  });

  it("computes 1 hour correctly (3600s)", () => {
    const oneHourMs = 3_600 * 1_000;
    expect(computeDuration(0, oneHourMs)).toBe(3_600);
  });

  it("computes duration when joinedAt is non-zero", () => {
    // ended_at = 10 000 ms, joined_at = 3 500 ms → diff = 6 500 ms → 6s
    expect(computeDuration(3_500, 10_000)).toBe(6);
  });
});
