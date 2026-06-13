import { Router } from "express";
import { db, adminDb } from "../supabase.js";
import { startRecording, stopRecording } from "../recording-manager.js";

const router = Router();

/**
 * POST /sessions/:id/recordings/start
 * Agent only. Starts call stream recording.
 * Checks no active recording already exists.
 * Requirements: 5.1, 5.2
 */
router.post("/:id/recordings/start", async (req, res) => {
  const { id: sessionId } = req.params;

  try {
    // 1. Verify if session exists and is active
    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
    }

    if (session.status !== "active") {
      return res.status(409).json({ 
        error: `Cannot record session in status '${session.status}'`, 
        code: "INVALID_SESSION_STATUS" 
      });
    }

    // 2. Check if there's already a recording record in database that is currently 'recording' or 'processing'
    const { data: existingRecording, error: recError } = await db
      .from("recordings")
      .select("status")
      .eq("session_id", sessionId)
      .in("status", ["recording", "processing"])
      .maybeSingle();

    if (existingRecording) {
      return res.status(409).json({
        error: "A recording is already active or processing for this session",
        code: "RECORDING_ALREADY_ACTIVE",
      });
    }

    // 3. Initiate recording process
    const { recordingId } = await startRecording(sessionId);

    return res.status(200).json({
      message: "Recording started successfully",
      recordingId,
    });
  } catch (err) {
    console.error("[POST /recordings/start] error:", err.message);
    if (err.message.includes("already active") || err.message.includes("producers")) {
      return res.status(409).json({ error: err.message, code: "RECORDING_START_FAILED" });
    }
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /sessions/:id/recordings/stop
 * Agent only. Stops call stream recording.
 * Requirements: 5.1, 5.3
 */
router.post("/:id/recordings/stop", async (req, res) => {
  const { id: sessionId } = req.params;

  try {
    await stopRecording(sessionId);
    return res.status(200).json({ message: "Recording stopped and queued for processing" });
  } catch (err) {
    console.error("[POST /recordings/stop] error:", err.message);
    if (err.message.includes("No active recording")) {
      return res.status(404).json({ error: err.message, code: "RECORDING_NOT_FOUND" });
    }
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /sessions/:id/recordings/:rid/url
 * Agent only. Returns signed download URL for ready recordings.
 * Implements up to 3 exponential backoff retries on storage fail.
 * Requirements: 5.6
 */
router.get("/:id/recordings/:rid/url", async (req, res) => {
  const { id: sessionId, rid: recordingId } = req.params;

  try {
    // 1. Fetch recording metadata
    const { data: recording, error: dbError } = await db
      .from("recordings")
      .select("*")
      .eq("id", recordingId)
      .eq("session_id", sessionId)
      .single();

    if (dbError || !recording) {
      return res.status(404).json({ error: "Recording not found", code: "RECORDING_NOT_FOUND" });
    }

    if (recording.status !== "ready") {
      return res.status(409).json({
        error: `Recording is not ready. Current status: ${recording.status}`,
        code: "RECORDING_NOT_READY",
      });
    }

    // 2. Generate signed download link with 30 minutes validity and retry logic
    const signedUrl = await getSignedUrlWithRetry(sessionId, recordingId);
    
    return res.json({ url: signedUrl });
  } catch (err) {
    console.error("[GET /recordings/url] error after retries:", err.message);
    return res.status(503).json({
      error: "Failed to generate signed download URL. Storage service unavailable.",
      code: "STORAGE_SERVICE_UNAVAILABLE",
    });
  }
});

/**
 * Helper: Generates a signed URL with up to 3 retries (1s, 2s, 4s delays).
 */
async function getSignedUrlWithRetry(sessionId, recordingId) {
  const delays = [1000, 2000, 4000];
  let attempt = 0;

  while (true) {
    try {
      const { data, error } = await adminDb.storage
        .from("recordings")
        .createSignedUrl(`${sessionId}/${recordingId}.webm`, 1800);

      if (error) throw error;
      if (data?.signedUrl) return data.signedUrl;
      throw new Error("Storage returned empty signedUrl");
    } catch (err) {
      if (attempt >= 3) {
        throw err;
      }
      const delay = delays[attempt];
      attempt++;
      console.warn(`[recordings] Signed URL generation failed (attempt ${attempt}/4). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export default router;
