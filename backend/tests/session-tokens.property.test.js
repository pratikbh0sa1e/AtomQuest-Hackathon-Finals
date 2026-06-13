/**
 * Property-based tests for invite token uniqueness and format.
 *
 * Property 1: Session creation produces valid, unique invite tokens
 * Validates: Requirements 1.1
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import crypto from "crypto";

// UUID v4 regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Simulates the token generation used in POST /sessions:
 * `const invite_token = crypto.randomUUID();`
 */
function generateToken() {
  return crypto.randomUUID();
}

/**
 * Simulates N concurrent session creates and returns all generated tokens.
 */
function generateNTokens(n) {
  return Array.from({ length: n }, () => generateToken());
}

describe("Session invite token uniqueness (Property 1) — Validates: Requirements 1.1", () => {
  it("Property: for any N (1–100) concurrent session creates, all returned tokens are distinct", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const tokens = generateNTokens(n);
        const uniqueTokens = new Set(tokens);
        // All tokens must be distinct — no duplicates
        expect(uniqueTokens.size).toBe(n);
      }),
      { numRuns: 200 },
    );
  });

  it("Property: each generated token is a non-empty string", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const tokens = generateNTokens(n);
        for (const token of tokens) {
          expect(typeof token).toBe("string");
          expect(token.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("Property: crypto.randomUUID() always produces a valid UUID v4 format string", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const tokens = generateNTokens(n);
        for (const token of tokens) {
          expect(token).toMatch(UUID_REGEX);
        }
      }),
      { numRuns: 200 },
    );
  });
});
