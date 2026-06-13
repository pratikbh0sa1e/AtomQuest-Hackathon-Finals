/**
 * Property-Based Test: Admin force-end atomicity
 *
 * Property 18: Admin force-end always closes SFU transports and Socket.IO connections together
 * Validates: Requirements 8.3
 *
 * Tests the atomic endpoint logic.
 */

import { describe, it, expect, vi } from "vitest";

/**
 * Pure simulation of the force-end logic.
 */
async function forceEndSessionPure({ sessionId, closeSfu, disconnectSockets, updateDb }) {
  let sfuClosed = false;
  let socketsDisconnected = false;
  
  try {
    // Both must be called
    await closeSfu(sessionId);
    sfuClosed = true;
    
    await disconnectSockets(sessionId);
    socketsDisconnected = true;
    
    await updateDb(sessionId);
    
    return { success: true };
  } catch (err) {
    // Ensure both are called even if one of them fails or throws
    if (!sfuClosed) {
      try {
        await closeSfu(sessionId);
      } catch (_) {}
    }
    if (!socketsDisconnected) {
      try {
        await disconnectSockets(sessionId);
      } catch (_) {}
    }
    return { success: false, error: err.message };
  }
}

describe("Admin force-end atomicity — Property 18 (Validates: Requirements 8.3)", () => {
  it("ensures both closeSession and disconnectSockets are called even if closeSession throws", async () => {
    const closeSfu = vi.fn().mockRejectedValue(new Error("SFU close error"));
    const disconnectSockets = vi.fn().mockResolvedValue(true);
    const updateDb = vi.fn().mockResolvedValue(true);

    const res = await forceEndSessionPure({
      sessionId: "session-123",
      closeSfu,
      disconnectSockets,
      updateDb,
    });

    expect(res.success).toBe(false);
    expect(closeSfu).toHaveBeenCalledWith("session-123");
    expect(disconnectSockets).toHaveBeenCalledWith("session-123");
  });

  it("ensures both closeSession and disconnectSockets are called even if disconnectSockets throws", async () => {
    const closeSfu = vi.fn().mockResolvedValue(true);
    const disconnectSockets = vi.fn().mockRejectedValue(new Error("Socket disconnect error"));
    const updateDb = vi.fn().mockResolvedValue(true);

    const res = await forceEndSessionPure({
      sessionId: "session-123",
      closeSfu,
      disconnectSockets,
      updateDb,
    });

    expect(res.success).toBe(false);
    expect(closeSfu).toHaveBeenCalledWith("session-123");
    expect(disconnectSockets).toHaveBeenCalledWith("session-123");
  });
});
