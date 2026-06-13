/**
 * Property 7: Session status transitions are server-enforced
 * Validates: Requirements 2.7
 *
 * Generates arbitrary (from, to) status pairs and asserts that:
 *  - validateTransition returns true only for the three valid transitions
 *  - validateTransition returns false for every other pair, including
 *    unknown status strings
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// Mock Supabase so sessionStatus.js can be imported without real DB credentials.
vi.mock("../supabase.js", () => ({
  db: {},
  adminDb: {},
}));
import {
  validateTransition,
  VALID_TRANSITIONS,
} from "../middleware/sessionStatus.js";

// Canonical set of valid (from, to) pairs derived from the spec
const VALID_PAIRS = new Set(
  Object.entries(VALID_TRANSITIONS).flatMap(([from, tos]) =>
    tos.map((to) => `${from}→${to}`),
  ),
);

const STATUS_VALUES = ["pending", "active", "ended"];

describe("Property 7 – Session status transitions are server-enforced", () => {
  /**
   * Property 7a: For any known-valid (from, to) pair, validateTransition returns true.
   */
  it("7a: valid transitions always return true", () => {
    // Build an explicit arbitrary that only yields valid pairs
    const validPairArb = fc
      .constantFrom(...STATUS_VALUES)
      .chain((from) => {
        const targets = VALID_TRANSITIONS[from];
        // Only produce pairs where there is at least one valid target
        if (targets.length === 0) return fc.constant(null);
        return fc.constantFrom(...targets).map((to) => ({ from, to }));
      })
      .filter((pair) => pair !== null);

    fc.assert(
      fc.property(validPairArb, ({ from, to }) => {
        expect(validateTransition(from, to)).toBe(true);
      }),
    );
  });

  /**
   * Property 7b: For any (from, to) pair drawn from the three known statuses
   * where the transition is NOT valid, validateTransition returns false.
   */
  it("7b: invalid transitions between known statuses always return false", () => {
    const invalidKnownPairArb = fc
      .tuple(
        fc.constantFrom(...STATUS_VALUES),
        fc.constantFrom(...STATUS_VALUES),
      )
      .filter(([from, to]) => !VALID_PAIRS.has(`${from}→${to}`));

    fc.assert(
      fc.property(invalidKnownPairArb, ([from, to]) => {
        expect(validateTransition(from, to)).toBe(false);
      }),
    );
  });

  /**
   * Property 7c: For any (from, to) pair where `from` is an unknown/arbitrary
   * string, validateTransition returns false.
   */
  it("7c: unknown `from` status always returns false", () => {
    // Generate strings that are NOT one of the known statuses
    const unknownFromArb = fc
      .string({ minLength: 1 })
      .filter((s) => !STATUS_VALUES.includes(s));

    const toArb = fc.oneof(
      fc.constantFrom(...STATUS_VALUES),
      fc.string({ minLength: 1 }),
    );

    fc.assert(
      fc.property(unknownFromArb, toArb, (from, to) => {
        expect(validateTransition(from, to)).toBe(false);
      }),
    );
  });

  /**
   * Property 7d: For any (from, to) pair where `to` is an unknown/arbitrary
   * string, validateTransition returns false.
   */
  it("7d: unknown `to` status always returns false", () => {
    const unknownToArb = fc
      .string({ minLength: 1 })
      .filter((s) => !STATUS_VALUES.includes(s));

    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_VALUES),
        unknownToArb,
        (from, to) => {
          expect(validateTransition(from, to)).toBe(false);
        },
      ),
    );
  });

  /**
   * Explicit edge cases — ended has no valid outgoing transitions.
   */
  it("ended→* always returns false for all known statuses", () => {
    for (const to of STATUS_VALUES) {
      expect(validateTransition("ended", to)).toBe(false);
    }
  });

  it("active→pending always returns false", () => {
    expect(validateTransition("active", "pending")).toBe(false);
  });

  it("pending→active returns true", () => {
    expect(validateTransition("pending", "active")).toBe(true);
  });

  it("pending→ended returns true", () => {
    expect(validateTransition("pending", "ended")).toBe(true);
  });

  it("active→ended returns true", () => {
    expect(validateTransition("active", "ended")).toBe(true);
  });
});
