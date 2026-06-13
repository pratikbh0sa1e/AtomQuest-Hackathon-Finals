/**
 * Property-Based Test: Chat history ordering
 *
 * Property 23: Chat history is in ascending chronological order
 * Validates: Requirements 3.3
 *
 * Tests the pure sorting logic — not the DB layer.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure function that mirrors the chat history retrieval logic:
 * - Sorts messages in ascending order of created_at
 *
 * @param {Array<{ id: string, created_at: Date }>} messages
 * @returns {Array<{ id: string, created_at: Date }>}
 */
function getChatHistory(messages) {
  return [...messages].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const messageArb = fc.record({
  id: fc.uuid(),
  created_at: fc
    .integer({ min: 0, max: 2_000_000_000_000 })
    .map((ms) => new Date(ms)),
});

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("getChatHistory — Property 23: ascending chronological order", () => {
  /**
   * Property A: For any array of messages, result is in non-decreasing order
   * of created_at timestamp.
   * **Validates: Requirements 3.3**
   */
  it("Property A — result is in non-decreasing order of created_at", () => {
    fc.assert(
      fc.property(
        fc.array(messageArb, { minLength: 0, maxLength: 500 }),
        (messages) => {
          const result = getChatHistory(messages);

          for (let i = 0; i < result.length - 1; i++) {
            const current = result[i].created_at.getTime();
            const next = result[i + 1].created_at.getTime();
            expect(current).toBeLessThanOrEqual(next);
          }
        },
      ),
    );
  });

  /**
   * Property B: Result contains the same number of messages as input.
   * **Validates: Requirements 3.3**
   */
  it("Property B — result contains same number of messages as input", () => {
    fc.assert(
      fc.property(
        fc.array(messageArb, { minLength: 0, maxLength: 500 }),
        (messages) => {
          const result = getChatHistory(messages);
          expect(result.length).toBe(messages.length);
        },
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("returns empty array for empty input", () => {
    expect(getChatHistory([])).toEqual([]);
  });

  it("returns single-element array unchanged", () => {
    const msg = { id: "abc", created_at: new Date("2024-01-01T00:00:00Z") };
    const result = getChatHistory([msg]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc");
  });
});
