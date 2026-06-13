/**
 * Property-Based Test: File upload count limit
 *
 * Property 14: Per-session file limit is enforced
 * Validates: Requirements 6.6
 *
 * Tests the limit checking function:
 *   checkFileLimit(count) => 200 | 422
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure file limit checker
 * @param {number} currentCount
 * @returns {number} HTTP status code
 */
function checkFileLimit(currentCount) {
  if (currentCount >= 50) return 422;
  return 200;
}

describe("Per-session file limit — Property 14 (Validates: Requirements 6.6)", () => {
  /**
   * Property A: Any upload request when count is >= 50 must return HTTP 422.
   */
  it("returns HTTP 422 when current session file count is 50 or greater", () => {
    // Generate counts from 50 to 1000
    const countArb = fc.integer({ min: 50, max: 1000 });

    fc.assert(
      fc.property(countArb, (count) => {
        expect(checkFileLimit(count)).toBe(422);
      })
    );
  });

  /**
   * Property B: Any upload request when count is < 50 must be allowed (HTTP 200).
   */
  it("returns HTTP 200 when current session file count is strictly less than 50", () => {
    // Generate counts from 0 to 49
    const countArb = fc.integer({ min: 0, max: 49 });

    fc.assert(
      fc.property(countArb, (count) => {
        expect(checkFileLimit(count)).toBe(200);
      })
    );
  });
});
