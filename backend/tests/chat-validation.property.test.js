/**
 * Property 24: Chat message length validation
 * Validates: Requirements 3.4, 3.5
 *
 * Tests the pure validateChatMessage function against three properties:
 *  A) Any string with length > 10000 → { valid: false, error: 'too_long' }
 *  B) Any empty or whitespace-only string → { valid: false, error: 'empty' }
 *  C) Any non-empty, non-whitespace-only string with length ≤ 10000 → { valid: true }
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure validation function (mirrors the logic in handlers/signaling.js)
// ---------------------------------------------------------------------------
function validateChatMessage(content) {
  if (typeof content !== "string" || content.trim().length === 0) {
    return { valid: false, error: "empty" };
  }
  if (content.length > 10000) {
    return { valid: false, error: "too_long" };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Strings guaranteed to be longer than 10000 characters */
const tooLongStringArb = fc.string({ minLength: 10001 });

/** Strings that are empty or contain only whitespace characters */
const whitespaceOnlyArb = fc.oneof(
  fc.constant(""),
  fc.array(fc.constantFrom(" ", "\t", "\n"), { minLength: 1 }).map((arr) => arr.join("")),
);

/**
 * Strings that have at least one non-whitespace character and a length ≤ 10000.
 * We build them by taking any string ≤ 10000 chars that is not whitespace-only.
 */
const validMessageArb = fc
  .string({ minLength: 1, maxLength: 10000 })
  .filter((s) => s.trim().length > 0);

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property 24 – Chat message length validation", () => {
  /**
   * Property A: for any string with length > 10000
   *             → valid is false, error is 'too_long'
   */
  it("A: strings longer than 10000 chars are rejected as too_long", () => {
    fc.assert(
      fc.property(tooLongStringArb, (content) => {
        const result = validateChatMessage(content);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("too_long");
      }),
    );
  });

  /**
   * Property B: for any string that is empty or whitespace-only
   *             → valid is false, error is 'empty'
   */
  it("B: empty or whitespace-only strings are rejected as empty", () => {
    fc.assert(
      fc.property(whitespaceOnlyArb, (content) => {
        const result = validateChatMessage(content);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("empty");
      }),
    );
  });

  /**
   * Property C: for any non-empty, non-whitespace-only string with length ≤ 10000
   *             → valid is true
   */
  it("C: non-empty, non-whitespace strings ≤ 10000 chars are accepted", () => {
    fc.assert(
      fc.property(validMessageArb, (content) => {
        const result = validateChatMessage(content);
        expect(result.valid).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Explicit edge cases
  // ---------------------------------------------------------------------------

  it("empty string is rejected as empty", () => {
    expect(validateChatMessage("")).toEqual({ valid: false, error: "empty" });
  });

  it("single space is rejected as empty", () => {
    expect(validateChatMessage(" ")).toEqual({ valid: false, error: "empty" });
  });

  it("tab and newline only is rejected as empty", () => {
    expect(validateChatMessage("\t\n")).toEqual({
      valid: false,
      error: "empty",
    });
  });

  it("exactly 10000 chars is accepted", () => {
    const content = "a".repeat(10000);
    expect(validateChatMessage(content)).toEqual({ valid: true });
  });

  it("exactly 10001 chars is rejected as too_long", () => {
    const content = "a".repeat(10001);
    expect(validateChatMessage(content)).toEqual({
      valid: false,
      error: "too_long",
    });
  });

  it("single non-whitespace character is accepted", () => {
    expect(validateChatMessage("x")).toEqual({ valid: true });
  });

  it("message with leading/trailing whitespace but non-empty core is accepted", () => {
    expect(validateChatMessage("  hello  ")).toEqual({ valid: true });
  });
});
