import { describe, it, expect, vi, beforeAll } from "vitest";
import fc from "fast-check";
import request from "supertest";
import express from "express";

// Mock Supabase
vi.mock("../supabase.js", () => {
  return {
    db: {
      from: vi.fn(),
    },
    adminDb: {
      from: vi.fn(),
    },
  };
});

import { db } from "../supabase.js";
import analysisRouter from "../routes/analysis.js";

// Setup express app with the router
function buildApp() {
  const app = express();
  app.use(express.json());
  // Mount at root /sessions for testing (matching router path structure)
  app.use("/sessions", analysisRouter);
  return app;
}

describe("Property 26: Analysis status response matches stored status (Validates: Requirements 10.3, 10.4, 10.5)", () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it("returns correct HTTP status and body matching database recording state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // sessionId
        fc.constantFrom("processing", "completed", "failed", "none"),
        fc.option(fc.string()), // transcript
        fc.option(fc.string()), // summary
        async (sessionId, analysisStatus, transcript, summary) => {
          vi.restoreAllMocks();

          // Mock recording lookup
          const mockRecordingSelect = vi.fn().mockImplementation(() => {
            if (analysisStatus === "none") {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({
              data: { id: "rec-123", analysis_status: analysisStatus },
              error: null,
            });
          });

          const mockRecordingFrom = vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: mockRecordingSelect,
                  })),
                })),
              })),
            })),
          }));

          // Mock session lookup for completed transcript/summary
          const mockSessionSelect = vi.fn().mockResolvedValue({
            data: { ai_transcript: transcript, ai_summary: summary },
            error: null,
          });

          const mockSessionFrom = vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: mockSessionSelect,
              })),
            })),
          }));

          // Register mocks dynamically depending on queries
          vi.spyOn(db, "from").mockImplementation((table) => {
            if (table === "recordings") {
              return mockRecordingFrom();
            }
            if (table === "sessions") {
              return mockSessionFrom();
            }
            return {
              select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
            };
          });

          // Perform GET request
          const res = await request(app).get(`/sessions/${sessionId}/analysis`);

          if (analysisStatus === "none") {
            // Requirement 10.4: returns 404 when no recording exists
            expect(res.status).toBe(404);
          } else if (analysisStatus === "processing") {
            // Requirement 10.4: returns 202 with "Analysis in progress"
            expect(res.status).toBe(202);
            expect(res.body.message).toBe("Analysis in progress");
          } else if (analysisStatus === "completed") {
            // Requirement 10.3: returns 200 with transcript and summary
            expect(res.status).toBe(200);
            expect(res.body.transcript).toBe(transcript);
            expect(res.body.summary).toBe(summary);
          } else if (analysisStatus === "failed") {
            // Requirement 10.5: returns 200 with "Analysis failed"
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Analysis failed");
          }
        }
      ),
      { numRuns: 40 }
    );
  });
});
