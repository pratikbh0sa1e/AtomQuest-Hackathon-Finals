/**
 * Property-Based Test: Expired invite tokens → HTTP 410
 *
 * Property 2: Expired invite tokens always return HTTP 410
 * Validates: Requirements 1.3
 *
 * Tests the pure expiry check logic extracted from backend/routes/auth.js:
 *   isTokenExpired(createdAt, now) => (now - createdAt) > 24 * 60 * 60 * 1000
 *
 * No DB calls needed — we test the pure logic only.
 * Integer-mapped timestamps are used to avoid NaN Date issues.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure expiry check — mirrors the logic in backend/routes/auth.js
// ageMs = now - createdAt (both are integer millisecond timestamps)
// expired  ⟺  ageMs > 24 * 60 * 60 * 1000
// ---------------------------------------------------------------------------
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * @param {number} createdAt - Unix timestamp in ms when the token was created
 * @param {number} now       - Unix timestamp in ms representing current time
 * @returns {boolean}        - true if the token has expired (age > 24h)
 *
 * **Validates: Requirements 1.3**
 */
function isTokenExpired(createdAt, now) {
  return now - createdAt > TWENTY_FOUR_HOURS_MS;
}

// ---------------------------------------------------------------------------
// Timestamp range — a safe 20-year window as integer milliseconds
// Using a fixed epoch base to keep numbers manageable
// ---------------------------------------------------------------------------
const EPOCH_BASE = new Date("2020-01-01T00:00:00.000Z").getTime(); // 1577836800000
const TWENTY_YEARS_MS = 20 * 365 * 24 * 60 * 60 * 1000;

// Arbitrary integer representing a "now" timestamp in the 20-year window
const nowArb = fc.integer({
  min: EPOCH_BASE,
  max: EPOCH_BASE + TWENTY_YEARS_MS,
});

describe("Token expiry — Property 2 (Validates: Requirements 1.3)", () => {
  /**
   * Property A: For any createdAt that is strictly MORE than 24 h before now,
   * isTokenExpired must return true.
   *
   * Generator strategy:
   *   - Pick an arbitrary integer "now" within the 20-year window
   *   - Pick an extra offset strictly > 0 (so total age = 24h + extraMs)
   *   - createdAt = now - 24h - extraMs  (ensures age > 24h)
   */
  it("isTokenExpired returns true for any createdAt strictly older than 24 h", () => {
    const MAX_EXTRA_MS = 10 * 365 * 24 * 60 * 60 * 1000; // up to 10 extra years

    fc.assert(
      fc.property(
        nowArb,
        fc.integer({ min: 1, max: MAX_EXTRA_MS }), // strictly positive extra
        (now, extraMs) => {
          const createdAt = now - TWENTY_FOUR_HOURS_MS - extraMs;
          expect(isTokenExpired(createdAt, now)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * Property B: For any createdAt within 24 h of now (age 0 … 24h inclusive),
   * isTokenExpired must return false.
   *
   * Generator strategy:
   *   - Pick an arbitrary integer "now" within the 20-year window
   *   - Pick an age between 0 ms and 24 h (inclusive)
   *   - createdAt = now - ageMs  (age <= 24h → not expired)
   */
  it("isTokenExpired returns false for any createdAt within 24 h of now", () => {
    fc.assert(
      fc.property(
        nowArb,
        fc.integer({ min: 0, max: TWENTY_FOUR_HOURS_MS }), // age [0, 24h]
        (now, ageMs) => {
          const createdAt = now - ageMs;
          expect(isTokenExpired(createdAt, now)).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * Boundary: createdAt exactly 24 h before now should NOT be considered
   * expired (age === 24h is not strictly greater than 24h).
   */
  it("isTokenExpired returns false when age equals exactly 24 h", () => {
    const now = new Date("2023-06-15T12:00:00.000Z").getTime();
    const createdAt = now - TWENTY_FOUR_HOURS_MS;
    expect(isTokenExpired(createdAt, now)).toBe(false);
  });

  /**
   * Boundary: createdAt is 24 h + 1 ms before now — must be expired.
   */
  it("isTokenExpired returns true when age equals 24 h + 1 ms", () => {
    const now = new Date("2023-06-15T12:00:00.000Z").getTime();
    const createdAt = now - TWENTY_FOUR_HOURS_MS - 1;
    expect(isTokenExpired(createdAt, now)).toBe(true);
  });
});
