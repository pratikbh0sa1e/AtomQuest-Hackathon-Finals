/**
 * Property 21: `errors_total` counter increments correctly per error type
 * Validates: Requirements 9.3
 *
 * Tests the pure logic responsible for:
 *  1. Validating that only allowed error_type label values are accepted.
 *  2. Ensuring each error event increments exactly the correct label's counter
 *     by exactly 1, while leaving all other label counters unchanged.
 *
 * No Prometheus client is involved — we test the counting/validation
 * functions directly.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure logic under test
// ---------------------------------------------------------------------------

const VALID_ERROR_TYPES = new Set([
  "client_error",
  "server_error",
  "internal_error",
]);

/**
 * Validates whether an error_type label value is in the allowed set.
 * @param {string} type
 * @returns {boolean}
 */
function isValidErrorType(type) {
  return VALID_ERROR_TYPES.has(type);
}

/**
 * In-memory counter store — a plain object keyed by error_type.
 * Starts all counters at zero.
 * @returns {{ client_error: number, server_error: number, internal_error: number }}
 */
function createCounterStore() {
  return { client_error: 0, server_error: 0, internal_error: 0 };
}

/**
 * Increments the counter for the given error type by 1.
 * Throws if the type is invalid (mirrors the real incrementError behaviour).
 * @param {{ client_error: number, server_error: number, internal_error: number }} store
 * @param {string} type
 */
function incrementCounter(store, type) {
  if (!isValidErrorType(type)) {
    throw new Error(
      `Invalid error_type "${type}". Must be one of: ${[...VALID_ERROR_TYPES].join(", ")}`,
    );
  }
  store[type] += 1;
}

/**
 * Replays a sequence of error events against a fresh counter store and
 * returns the final store state.
 * @param {string[]} events - array of error_type strings (all must be valid)
 * @returns {{ client_error: number, server_error: number, internal_error: number }}
 */
function replayEvents(events) {
  const store = createCounterStore();
  for (const type of events) {
    incrementCounter(store, type);
  }
  return store;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const validErrorTypeArb = fc.constantFrom(
  "client_error",
  "server_error",
  "internal_error",
);

/** Sequence of 0–200 valid error events */
const errorEventSequenceArb = fc.array(validErrorTypeArb, {
  minLength: 0,
  maxLength: 200,
});

/** A string guaranteed NOT to be one of the valid types */
const invalidErrorTypeArb = fc
  .string({ minLength: 1 })
  .filter((s) => !VALID_ERROR_TYPES.has(s));

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property 21 – errors_total counter increments correctly per error type", () => {
  /**
   * Property 21a: For any sequence of valid error events, each event
   * increments exactly the correct label's counter by 1 — the final
   * counter value for each label equals the number of times that label
   * appears in the event sequence.
   */
  it("21a: final counter values match event frequency per label", () => {
    fc.assert(
      fc.property(errorEventSequenceArb, (events) => {
        const store = replayEvents(events);

        const expected = {
          client_error: 0,
          server_error: 0,
          internal_error: 0,
        };
        for (const type of events) {
          expected[type] += 1;
        }

        expect(store.client_error).toBe(expected.client_error);
        expect(store.server_error).toBe(expected.server_error);
        expect(store.internal_error).toBe(expected.internal_error);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 21b: For any single valid error event, only the target label
   * is incremented; all other labels remain at their previous values.
   */
  it("21b: a single error event increments exactly one label and no others", () => {
    fc.assert(
      fc.property(
        errorEventSequenceArb, // baseline state before the event
        validErrorTypeArb, // the single error event to apply
        (baseline, eventType) => {
          const before = replayEvents(baseline);
          const after = { ...before };
          incrementCounter(after, eventType);

          for (const label of VALID_ERROR_TYPES) {
            if (label === eventType) {
              expect(after[label]).toBe(before[label] + 1);
            } else {
              expect(after[label]).toBe(before[label]);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 21c: Counters are monotonically non-decreasing — replaying
   * more events never decreases any counter value.
   */
  it("21c: counter values are monotonically non-decreasing as events are added", () => {
    fc.assert(
      fc.property(
        errorEventSequenceArb,
        validErrorTypeArb,
        (baseline, extra) => {
          const before = replayEvents(baseline);
          const after = replayEvents([...baseline, extra]);

          for (const label of VALID_ERROR_TYPES) {
            expect(after[label]).toBeGreaterThanOrEqual(before[label]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 21d: isValidErrorType returns true for all three valid types
   * and false for any other string.
   */
  it("21d: only the three canonical error types are accepted as valid", () => {
    // All valid types must pass
    for (const type of VALID_ERROR_TYPES) {
      expect(isValidErrorType(type)).toBe(true);
    }

    // Any other string must fail
    fc.assert(
      fc.property(invalidErrorTypeArb, (type) => {
        expect(isValidErrorType(type)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 21e: incrementCounter throws for any invalid error_type label,
   * and the counter store is left unchanged after the throw.
   */
  it("21e: invalid error_type throws and leaves counter state unchanged", () => {
    fc.assert(
      fc.property(
        errorEventSequenceArb,
        invalidErrorTypeArb,
        (baseline, badType) => {
          const storeBefore = replayEvents(baseline);
          const storeSnapshot = { ...storeBefore };

          expect(() => incrementCounter(storeBefore, badType)).toThrow();

          // Store must be unchanged after the throw
          expect(storeBefore).toEqual(storeSnapshot);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 21f: The total of all label counters equals the total number
   * of valid events processed (sum invariant).
   */
  it("21f: sum of all label counters equals total number of events", () => {
    fc.assert(
      fc.property(errorEventSequenceArb, (events) => {
        const store = replayEvents(events);
        const total =
          store.client_error + store.server_error + store.internal_error;
        expect(total).toBe(events.length);
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // Explicit edge cases
  // ---------------------------------------------------------------------------

  it("empty event sequence leaves all counters at zero", () => {
    const store = replayEvents([]);
    expect(store).toEqual({
      client_error: 0,
      server_error: 0,
      internal_error: 0,
    });
  });

  it("client_error increments only client_error counter", () => {
    const store = createCounterStore();
    incrementCounter(store, "client_error");
    expect(store.client_error).toBe(1);
    expect(store.server_error).toBe(0);
    expect(store.internal_error).toBe(0);
  });

  it("server_error increments only server_error counter", () => {
    const store = createCounterStore();
    incrementCounter(store, "server_error");
    expect(store.server_error).toBe(1);
    expect(store.client_error).toBe(0);
    expect(store.internal_error).toBe(0);
  });

  it("internal_error increments only internal_error counter", () => {
    const store = createCounterStore();
    incrementCounter(store, "internal_error");
    expect(store.internal_error).toBe(1);
    expect(store.client_error).toBe(0);
    expect(store.server_error).toBe(0);
  });

  it("five mixed events produce correct per-label totals", () => {
    const events = [
      "client_error",
      "server_error",
      "client_error",
      "internal_error",
      "client_error",
    ];
    const store = replayEvents(events);
    expect(store.client_error).toBe(3);
    expect(store.server_error).toBe(1);
    expect(store.internal_error).toBe(1);
  });

  it("unknown type 'database_error' throws", () => {
    const store = createCounterStore();
    expect(() => incrementCounter(store, "database_error")).toThrow(
      /Invalid error_type/,
    );
  });
});
