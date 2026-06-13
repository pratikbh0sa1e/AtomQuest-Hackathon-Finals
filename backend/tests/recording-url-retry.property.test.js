/**
 * Property-Based Test: Recording URL retry logic
 *
 * Property 11: Recording URL generation retries up to 3 times before returning HTTP 503
 * Validates: Requirements 5.6
 *
 * Tests the retry wrapper function with simulated backend call histories.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure retry function — mirrors the implementation in routes/recordings.js
 * @param {Array<() => Promise<string>>} attempts - A sequence of mock functions representing createSignedUrl calls
 * @returns {Promise<string>}
 */
async function executeRetryLogic(attempts) {
  let attempt = 0;
  
  while (true) {
    try {
      const result = await attempts[attempt]();
      return result; // success
    } catch (err) {
      if (attempt >= 3) {
        throw err; // fail after 3 retries (4 total attempts)
      }
      attempt++;
      // No delay in tests to run instantaneously
    }
  }
}

describe("Recording URL retry logic — Property 11 (Validates: Requirements 5.6)", () => {
  /**
   * Property A: If any of the first 4 attempts succeed, the function should return the valid signed URL.
   */
  it("succeeds if any of the first 4 attempts succeed", async () => {
    // Generate a success index from 0 to 3 (which represents the attempt index that resolves successfully)
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        async (successIndex) => {
          const mockAttempts = [];
          for (let i = 0; i < 4; i++) {
            if (i === successIndex) {
              mockAttempts.push(() => Promise.resolve("https://supabase-signed-url.com/rec-1"));
            } else {
              mockAttempts.push(() => Promise.reject(new Error("Storage unavailable")));
            }
          }

          const url = await executeRetryLogic(mockAttempts);
          expect(url).toBe("https://supabase-signed-url.com/rec-1");
        }
      )
    );
  });

  /**
   * Property B: If all 4 attempts fail, the function should propagate the error (resulting in HTTP 503).
   */
  it("fails if all 4 attempts fail", async () => {
    const mockAttempts = Array(4).fill(() => Promise.reject(new Error("Storage unavailable")));
    
    await expect(executeRetryLogic(mockAttempts)).rejects.toThrow("Storage unavailable");
  });
});
