/**
 * Property test for participant join record completeness.
 *
 * **Validates: Requirements 1.5**
 *
 * Property 4: Participant join records all required fields.
 *
 * For any valid join inputs (name, role, sessionId, ipAddress, now), the
 * constructed participant record must:
 *   - Have non-null `role`, `joined_at`, and `ip_address` fields.
 *   - Have `role` equal to either 'agent' or 'customer'.
 *   - Have `session_id` matching the provided `sessionId`.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure function that builds a participant record (mirrors auth.js /join logic)
// ---------------------------------------------------------------------------

/**
 * Build a participant record object as it would be inserted into the DB.
 *
 * @param {string} name       - Participant display name.
 * @param {string} role       - Participant role ('agent' | 'customer').
 * @param {string} sessionId  - UUID of the session being joined.
 * @param {string} ipAddress  - IP address of the connecting client.
 * @param {Date}   now        - Current timestamp at join time.
 * @returns {{ session_id: string, role: string, name: string, joined_at: string, connection_status: string, ip_address: string }}
 */
export function buildParticipantRecord(name, role, sessionId, ipAddress, now) {
  return {
    session_id: sessionId,
    role,
    name,
    joined_at: now.toISOString(),
    connection_status: "connected",
    ip_address: ipAddress,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const roleArb = fc.constantFrom("agent", "customer");
const nameArb = fc.string({ minLength: 1 });
const sessionIdArb = fc.uuid();
const ipArb = fc.string({ minLength: 1 });

// A Date within a safe range: epoch up to year 2100
const nowArb = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms));

const recordArb = fc
  .tuple(nameArb, roleArb, sessionIdArb, ipArb, nowArb)
  .map(([name, role, sessionId, ipAddress, now]) => ({
    input: { name, role, sessionId, ipAddress, now },
    record: buildParticipantRecord(name, role, sessionId, ipAddress, now),
  }));

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("buildParticipantRecord", () => {
  /**
   * Property 4a: role, joined_at, and ip_address are always non-null.
   * **Validates: Requirements 1.5**
   */
  it("Property 4a — role, joined_at, and ip_address are non-null for any valid inputs", () => {
    fc.assert(
      fc.property(recordArb, ({ record }) => {
        expect(record.role).not.toBeNull();
        expect(record.role).not.toBeUndefined();
        expect(record.joined_at).not.toBeNull();
        expect(record.joined_at).not.toBeUndefined();
        expect(record.ip_address).not.toBeNull();
        expect(record.ip_address).not.toBeUndefined();
      }),
    );
  });

  /**
   * Property 4b: role is always 'agent' or 'customer'.
   * **Validates: Requirements 1.5**
   */
  it("Property 4b — role is always 'agent' or 'customer'", () => {
    fc.assert(
      fc.property(recordArb, ({ record }) => {
        expect(["agent", "customer"]).toContain(record.role);
      }),
    );
  });

  /**
   * Property 4c: session_id always matches the provided sessionId.
   * **Validates: Requirements 1.5**
   */
  it("Property 4c — session_id matches the provided sessionId", () => {
    fc.assert(
      fc.property(recordArb, ({ input, record }) => {
        expect(record.session_id).toBe(input.sessionId);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Concrete unit tests
  // -------------------------------------------------------------------------

  it("sets connection_status to 'connected'", () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const record = buildParticipantRecord(
      "Alice",
      "customer",
      "abc-123",
      "192.168.1.1",
      now,
    );
    expect(record.connection_status).toBe("connected");
  });

  it("joined_at is an ISO 8601 string derived from the provided Date", () => {
    const now = new Date("2024-06-15T12:34:56.789Z");
    const record = buildParticipantRecord(
      "Bob",
      "agent",
      "session-xyz",
      "10.0.0.1",
      now,
    );
    expect(record.joined_at).toBe("2024-06-15T12:34:56.789Z");
  });

  it("preserves the participant name exactly", () => {
    const now = new Date();
    const record = buildParticipantRecord(
      "Jean-Pierre",
      "customer",
      "s-001",
      "127.0.0.1",
      now,
    );
    expect(record.name).toBe("Jean-Pierre");
  });
});
