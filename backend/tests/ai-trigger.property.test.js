import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

// Mock Supabase
vi.mock("../supabase.js", () => {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  return {
    db: {
      from: vi.fn(() => ({
        update: mockUpdate,
      })),
    },
    adminDb: {
      from: vi.fn(() => ({
        update: mockUpdate,
      })),
    },
  };
});

import { db } from "../supabase.js";
import { triggerAnalysis } from "../ai-client.js";

describe("Property 25: AI analysis trigger on recording ready (Validates: Requirements 10.1)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("calls fetch /analyze and updates DB status to completed on success", async () => {
    process.env.AI_SERVICE_ENABLED = "true";
    process.env.AI_SERVICE_URL = "http://localhost:8000";

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // sessionId
        fc.uuid(), // recordingId
        fc.string({ minLength: 10 }), // fileUrl
        fc.string(), // mockTranscript
        fc.string(), // mockSummary
        async (sessionId, recordingId, fileUrl, transcript, summary) => {
          vi.clearAllMocks();

          // Mock global fetch
          const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ transcript, summary }),
          });
          global.fetch = mockFetch;

          // Call trigger
          await triggerAnalysis(sessionId, recordingId, fileUrl);

          // Verify fetch call parameters
          expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              recording_id: recordingId,
              file_url: fileUrl,
            }),
            signal: expect.any(AbortSignal),
          });

          // Verify database updates for completed status
          expect(db.from).toHaveBeenCalledWith("recordings");
          expect(db.from).toHaveBeenCalledWith("sessions");
        }
      ),
      { numRuns: 20 }
    );
  });

  it("sets status to failed in DB if AI service call fails", async () => {
    process.env.AI_SERVICE_ENABLED = "true";
    process.env.AI_SERVICE_URL = "http://localhost:8000";

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // sessionId
        fc.uuid(), // recordingId
        fc.string({ minLength: 10 }), // fileUrl
        async (sessionId, recordingId, fileUrl) => {
          vi.clearAllMocks();

          // Mock global fetch to fail
          const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
          });
          global.fetch = mockFetch;

          // Call trigger
          await triggerAnalysis(sessionId, recordingId, fileUrl);

          // Verify database updates for failed status
          expect(db.from).toHaveBeenCalledWith("recordings");
        }
      ),
      { numRuns: 10 }
    );
  });
});
