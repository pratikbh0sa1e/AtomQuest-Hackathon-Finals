import { Router } from "express";
import { db } from "../supabase.js";

const router = Router();

/**
 * GET /sessions/:id/analysis
 * Agent only. Returns AI analysis result for the most recent recording in a session.
 *
 * Response shape depends on analysis_status:
 *   - 'processing' → 202 { message: 'Analysis in progress' }
 *   - 'completed'  → 200 { transcript, summary }  (from sessions table)
 *   - 'failed'     → 200 { message: 'Analysis failed' }
 *   - no recording → 404
 *
 * Requirements: 10.3, 10.4, 10.5
 */
router.get("/:id/analysis", async (req, res) => {
  const { id: sessionId } = req.params;

  try {
    // Fetch the most recent recording for the session
    const { data: recording, error: recError } = await db
      .from("recordings")
      .select("id, analysis_status")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recError) {
      console.error(
        "[GET /analysis] recordings query error:",
        recError.message,
      );
      return res
        .status(500)
        .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }

    if (!recording) {
      return res
        .status(404)
        .json({
          error: "No recording found for this session",
          code: "RECORDING_NOT_FOUND",
        });
    }

    const { analysis_status: status } = recording;

    if (status === "processing") {
      // Requirement 10.4
      return res.status(202).json({ message: "Analysis in progress" });
    }

    if (status === "completed") {
      // Requirement 10.3 — fetch transcript and summary from sessions table
      const { data: session, error: sessionError } = await db
        .from("sessions")
        .select("ai_transcript, ai_summary")
        .eq("id", sessionId)
        .single();

      if (sessionError || !session) {
        console.error(
          "[GET /analysis] session query error:",
          sessionError?.message,
        );
        return res
          .status(500)
          .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
      }

      return res.status(200).json({
        transcript: session.ai_transcript,
        summary: session.ai_summary,
      });
    }

    if (status === "failed") {
      // Requirement 10.5
      return res.status(200).json({ message: "Analysis failed" });
    }

    // analysis_status is null or an unexpected value — treat as no analysis yet
    return res
      .status(404)
      .json({
        error: "Analysis not available for this recording",
        code: "ANALYSIS_NOT_AVAILABLE",
      });
  } catch (err) {
    console.error("[GET /analysis] unexpected error:", err.message);
    return res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
