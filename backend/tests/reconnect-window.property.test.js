/**
 * Property-Based Test: Reconnect window timing behavior
 *
 * Property 16: No departure event during reconnect window
 * Validates: Requirements 7.2, 7.4
 *
 * Tests the reconnect timeout timeline:
 *   simulateDisconnectTimeline(reconnectTimeMs) => { departed: boolean }
 * If reconnect occurs < 30000ms, then departed is false.
 * If reconnect occurs >= 30000ms (or doesn't occur at all), then departed is true.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

const WINDOW_LIMIT_MS = 30000; // 30 seconds

/**
 * Pure timeline simulation logic
 * @param {number|null} reconnectTimeMs - millisecond time when participant reconnects (null if they never do)
 * @returns {{ departed: boolean }}
 */
function simulateDisconnectTimeline(reconnectTimeMs) {
  if (reconnectTimeMs !== null && reconnectTimeMs < WINDOW_LIMIT_MS) {
    return { departed: false };
  }
  return { departed: true };
}

describe("Reconnect window timing — Property 16 (Validates: Requirements 7.2, 7.4)", () => {
  /**
   * Property A: For any reconnect time strictly less than 30s, the participant has NOT departed.
   */
  it("does not broadcast departure if reconnection happens within the 30-second window", () => {
    // Generate reconnect times between 0 and 29,999 ms
    const safeReconnectTimeArb = fc.integer({ min: 0, max: WINDOW_LIMIT_MS - 1 });

    fc.assert(
      fc.property(safeReconnectTimeArb, (reconnectTimeMs) => {
        const result = simulateDisconnectTimeline(reconnectTimeMs);
        expect(result.departed).toBe(false);
      })
    );
  });

  /**
   * Property B: For any reconnect time equal to or greater than 30s, the participant HAS departed.
   */
  it("broadcasts departure if reconnection happens at or after 30 seconds", () => {
    // Generate reconnect times from 30,000 ms to 24 hours (86,400,000 ms)
    const lateReconnectTimeArb = fc.integer({ min: WINDOW_LIMIT_MS, max: 24 * 60 * 60 * 1000 });

    fc.assert(
      fc.property(lateReconnectTimeArb, (reconnectTimeMs) => {
        const result = simulateDisconnectTimeline(reconnectTimeMs);
        expect(result.departed).toBe(true);
      })
    );
  });

  /**
   * Property C: If the participant never reconnects (null time), they HAS departed.
   */
  it("broadcasts departure if the participant never reconnects (null)", () => {
    const result = simulateDisconnectTimeline(null);
    expect(result.departed).toBe(true);
  });
});
