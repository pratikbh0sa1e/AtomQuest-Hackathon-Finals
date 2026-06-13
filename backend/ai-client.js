import { db } from "./supabase.js";

/**
 * Triggers AI analysis for a completed recording.
 * If AI_SERVICE_ENABLED is not 'true', this is a no-op.
 * Requirements: 10.1, 10.6
 *
 * @param {string} sessionId
 * @param {string} recordingId
 * @param {string} fileUrl - The recording file URL to send to the AI service
 */
export async function triggerAnalysis(sessionId, recordingId, fileUrl) {
  if (process.env.AI_SERVICE_ENABLED !== "true") {
    return;
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${aiServiceUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        recording_id: recordingId,
        file_url: fileUrl,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AI service responded with status ${response.status}`);
    }

    const result = await response.json();

    // Update recording analysis_status to 'completed' — Requirement 10.2
    await db
      .from("recordings")
      .update({
        analysis_status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    // Store transcript and summary on the session record — Requirement 10.2
    await db
      .from("sessions")
      .update({
        ai_transcript: result.transcript ?? null,
        ai_summary: result.summary ?? null,
      })
      .eq("id", sessionId);
  } catch (err) {
    clearTimeout(timeoutId);

    // Log failure with required fields — Requirement 10.6
    console.error("[ai-client] Analysis failed:", {
      sessionId,
      recordingId,
      timestamp: new Date().toISOString(),
      error: err.message,
    });

    // Update analysis_status to 'failed' — Requirement 10.6
    await db
      .from("recordings")
      .update({
        analysis_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);
  }
}
