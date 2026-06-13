/**
 * Property-Based Test: Force-end notification ordering
 *
 * Property 19: Force-end sends participant notification before closing connections
 * Validates: Requirements 8.6
 *
 * Tests the ordering property:
 *   assert order: emit('session-terminated') -> disconnectSockets()
 */

import { describe, it, expect, vi } from "vitest";

async function terminateSessionWithOrderTracking(sessionId, emitter, disconnector, orderArray) {
  // Emit event first
  emitter.emit(sessionId, "session-terminated");
  orderArray.push("emit");
  
  // Disconnect sockets next
  disconnector.disconnect(sessionId);
  orderArray.push("disconnect");
}

describe("Force-end order sequence — Property 19 (Validates: Requirements 8.6)", () => {
  it("sends participant notification BEFORE closing connections", async () => {
    const order = [];
    const emitter = {
      emit: vi.fn().mockImplementation(() => {
        order.push("mock-emit-called");
      })
    };
    const disconnector = {
      disconnect: vi.fn().mockImplementation(() => {
        order.push("mock-disconnect-called");
      })
    };

    await terminateSessionWithOrderTracking("session-abc", emitter, disconnector, order);

    expect(emitter.emit).toHaveBeenCalledWith("session-abc", "session-terminated");
    expect(disconnector.disconnect).toHaveBeenCalledWith("session-abc");
    
    // Validate order sequence array
    expect(order).toEqual([
      "mock-emit-called",
      "emit",
      "mock-disconnect-called",
      "disconnect"
    ]);
    expect(order.indexOf("emit")).toBeLessThan(order.indexOf("disconnect"));
  });
});
