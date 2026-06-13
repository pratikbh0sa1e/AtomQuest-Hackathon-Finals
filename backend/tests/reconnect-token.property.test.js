/**
 * Property-Based Test: Reconnect token verification
 *
 * Property 17: Reconnect token identity verification
 * Validates: Requirements 7.3, 7.5
 *
 * Tests the token verification logic:
 *   verifyReconnectToken(storedToken, clientToken) => 200 | 401
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure reconnect token verification logic
 * @param {string} storedToken
 * @param {string} clientToken
 * @returns {number} status code
 */
function verifyReconnectToken(storedToken, clientToken) {
  if (!storedToken || storedToken !== clientToken) {
    return 401;
  }
  return 200;
}

describe("Reconnect token verification — Property 17 (Validates: Requirements 7.3, 7.5)", () => {
  /**
   * Property A: Reconnection with a matching token must succeed (return 200).
   */
  it("succeeds (200) when the client token matches the stored token", () => {
    // Generate arbitrary non-empty strings for tokens
    const tokenArb = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(tokenArb, (token) => {
        expect(verifyReconnectToken(token, token)).toBe(200);
      })
    );
  });

  /**
   * Property B: Reconnection with mismatched tokens must be rejected with 401.
   */
  it("rejects (401) when the client token does not match the stored token", () => {
    const tokenArb = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(
        tokenArb,
        tokenArb,
        (storedToken, clientToken) => {
          // Skip if by chance they generated identical strings
          if (storedToken === clientToken) return;

          expect(verifyReconnectToken(storedToken, clientToken)).toBe(401);
        }
      )
    );
  });

  /**
   * Property C: Reconnection with a missing or null client token must be rejected with 401.
   */
  it("rejects (401) when the client token is null or undefined", () => {
    const tokenArb = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(tokenArb, (storedToken) => {
        expect(verifyReconnectToken(storedToken, null)).toBe(401);
        expect(verifyReconnectToken(storedToken, undefined)).toBe(401);
      })
    );
  });
});
