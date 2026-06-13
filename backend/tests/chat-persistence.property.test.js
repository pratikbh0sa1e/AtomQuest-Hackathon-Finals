/**
 * Property test for chat message persistence field completeness.
 *
 * **Validates: Requirements 3.2**
 *
 * Property 22: Chat message persistence captures all required fields.
 *
 * For any valid chat inputs (sessionId, senderRole, senderName, content, now),
 * the constructed chat record must:
 *   - Have non-null `session_id`, `sender_role`, `sender_name`, `content`, and `created_at`.
 *   - Have `sender_role` equal to either 'agent' or 'customer'.
 *   - Have `created_at` as a valid ISO 8601 string.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure function that builds a chat message record (mirrors signaling.js chat:send logic)
// ---------------------------------------------------------------------------

/**
 * Build a chat record object as it would be inserted into the messages table.
 *
 * @param {string} sessionId   - UUID of the session.
 * @param {string} senderRole  - Role of the sender ('agent' | 'customer').
 * @param {string} senderName  - Display name of the sender.
 * @param {string} content     - Message text content.
 * @param {Date}   now         - Current timestamp when the message was sent.
 * @returns {{ session_id: string, sender_role: string, sender_name: string, content: string, created_at: string }}
 */
export function buildChatRecord(
  sessionId,
  senderRole,
  senderName,
  content,
  now,
) {
  return {
    session_id: sessionId,
    sender_role: senderRole,
    sender_name: senderName,
    content,
    created_at: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const sessionIdArb = fc.uuid();
const roleArb = fc.constantFrom("agent", "customer");
const nameArb = fc.string({ minLength: 1 });
const contentArb = fc.string({ minLength: 1 });

// A Date within a safe range: epoch up to year 2100
const nowArb = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms));

const recordArb = fc
  .tuple(sessionIdArb, roleArb, nameArb, contentArb, nowArb)
  .map(([sessionId, senderRole, senderName, content, now]) => ({
    input: { sessionId, senderRole, senderName, content, now },
    record: buildChatRecord(sessionId, senderRole, senderName, content, now),
  }));

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("buildChatRecord", () => {
  /**
   * Property A: session_id, sender_role, sender_name, content, and created_at are
   * always non-null for any valid inputs.
   * **Validates: Requirements 3.2**
   */
  it("Property 22a — all required fields are non-null for any valid inputs", () => {
    fc.assert(
      fc.property(recordArb, ({ record }) => {
        expect(record.session_id).not.toBeNull();
        expect(record.session_id).not.toBeUndefined();

        expect(record.sender_role).not.toBeNull();
        expect(record.sender_role).not.toBeUndefined();

        expect(record.sender_name).not.toBeNull();
        expect(record.sender_name).not.toBeUndefined();

        expect(record.content).not.toBeNull();
        expect(record.content).not.toBeUndefined();

        expect(record.created_at).not.toBeNull();
        expect(record.created_at).not.toBeUndefined();
      }),
    );
  });

  /**
   * Property B: sender_role is always 'agent' or 'customer'.
   * **Validates: Requirements 3.2**
   */
  it("Property 22b — sender_role is always 'agent' or 'customer'", () => {
    fc.assert(
      fc.property(recordArb, ({ record }) => {
        expect(["agent", "customer"]).toContain(record.sender_role);
      }),
    );
  });

  /**
   * Property C: created_at is a valid ISO 8601 string.
   * **Validates: Requirements 3.2**
   */
  it("Property 22c — created_at is a valid ISO 8601 string", () => {
    const iso8601Prefix = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

    fc.assert(
      fc.property(recordArb, ({ record }) => {
        expect(typeof record.created_at).toBe("string");
        expect(record.created_at).toMatch(iso8601Prefix);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Concrete unit tests
  // -------------------------------------------------------------------------

  it("preserves the session_id exactly", () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const record = buildChatRecord(
      "550e8400-e29b-41d4-a716-446655440000",
      "agent",
      "Alice",
      "Hello!",
      now,
    );
    expect(record.session_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("created_at is derived from the provided Date", () => {
    const now = new Date("2024-06-15T12:34:56.789Z");
    const record = buildChatRecord(
      "session-001",
      "customer",
      "Bob",
      "Need help",
      now,
    );
    expect(record.created_at).toBe("2024-06-15T12:34:56.789Z");
  });

  it("preserves the message content exactly", () => {
    const now = new Date();
    const record = buildChatRecord(
      "session-002",
      "agent",
      "Support Agent",
      "How can I assist you today?",
      now,
    );
    expect(record.content).toBe("How can I assist you today?");
  });
});
