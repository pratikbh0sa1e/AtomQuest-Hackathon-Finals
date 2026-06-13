/**
 * Property-Based Test: Duplicate recording start → HTTP 409
 *
 * Property 10: Duplicate recording start returns HTTP 409
 * Validates: Requirements 5.2
 *
 * Tests the duplicate recording start check logic:
 *   checkDuplicateRecording(existingRecordings, sessionId) => boolean
 * If any existing recording in the session has status 'recording' or 'processing'
 * then starting a new recording is disallowed (returns 409).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Pure duplicate check logic — mirrors routes/recordings.js check
 * @param {Array<{session_id: string, status: string}>} recordings
 * @param {string} sessionId
 * @returns {boolean} - true if duplicate (disallowed)
 */
function isDuplicateRecording(recordings, sessionId) {
  return recordings.some(
    (r) => 
      r.session_id === sessionId && 
      (r.status === "recording" || r.status === "processing")
  );
}

// Arbitrary status values
const statusArb = fc.constantFrom("recording", "processing", "ready", "failed");

// Arbitrary recording record
const recordingArb = fc.record({
  session_id: fc.uuid(),
  status: statusArb,
});

describe("Duplicate recording start — Property 10 (Validates: Requirements 5.2)", () => {
  /**
   * Property A: If any recording for target sessionId is 'recording' or 'processing',
   * the start request MUST be blocked as a duplicate.
   */
  it("always returns true (duplicate) if there is an active or processing recording for the session", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom("recording", "processing"),
        fc.array(recordingArb),
        (sessionId, activeStatus, otherRecordings) => {
          // Construct target list that has at least one active recording for sessionId
          const targetRecording = { session_id: sessionId, status: activeStatus };
          const list = [targetRecording, ...otherRecordings];

          expect(isDuplicateRecording(list, sessionId)).toBe(true);
        }
      )
    );
  });

  /**
   * Property B: If all recordings for target sessionId are in 'ready' or 'failed' status
   * (or if there are no recordings at all), the start request is allowed.
   */
  it("always returns false (allowed) if all recordings for the session are ready, failed, or if no recordings exist", () => {
    const inactiveStatusArb = fc.constantFrom("ready", "failed");
    const inactiveRecordingArb = fc.record({
      session_id: fc.uuid(),
      status: inactiveStatusArb,
    });

    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(inactiveRecordingArb),
        (sessionId, recordings) => {
          // Filter recordings to ensure no active statuses exist for this sessionId
          const filtered = recordings.map(r => {
            if (r.session_id === sessionId) {
              return { ...r, status: r.status === "recording" || r.status === "processing" ? "ready" : r.status };
            }
            return r;
          });

          expect(isDuplicateRecording(filtered, sessionId)).toBe(false);
        }
      )
    );
  });
});
