import { db, adminDb } from "./supabase.js";
import fs from "fs";
import { triggerAnalysis } from "./ai-client.js";

// Polling interval in milliseconds
const POLL_INTERVAL = 2000;

let isWorkerRunning = false;
let pollingTimer = null;

/**
 * Starts the background job polling loop.
 */
export function startJobWorker(io) {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  console.log("[jobs] Background Job Worker started.");
  pollJobs(io);
}

/**
 * Stops the background job polling loop.
 */
export function stopJobWorker() {
  isWorkerRunning = false;
  if (pollingTimer) clearTimeout(pollingTimer);
  console.log("[jobs] Background Job Worker stopped.");
}

async function pollJobs(io) {
  if (!isWorkerRunning) return;

  try {
    // 1. Fetch exactly ONE pending job, sorted by oldest first
    // Note: Since we only use Supabase REST API (not raw pg connection), we can't use SELECT FOR UPDATE SKIP LOCKED directly.
    // Instead, we fetch one pending job and try to atomically update it to 'processing'.
    const { data: jobs, error: fetchErr } = await adminDb
      .from("jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchErr) throw fetchErr;

    if (jobs && jobs.length > 0) {
      const job = jobs[0];

      // Atomically try to claim the job (Optimistic Locking via status check)
      const { data: claimedJob, error: claimErr } = await adminDb
        .from("jobs")
        .update({ 
          status: "processing", 
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id)
        .eq("status", "pending") // Only update if it's still pending
        .select()
        .single();

      if (claimErr || !claimedJob) {
        // Another worker might have grabbed it, just continue polling
        throw new Error("Failed to claim job or job already claimed");
      }

      console.log(`[jobs] Processing job ${job.id} of type ${job.type}`);

      try {
        let result = null;

        // Process based on type
        if (job.type === "FILE_UPLOAD") {
          result = await processFileUpload(job.payload, io);
        } else if (job.type === "RECORDING_FINALIZE") {
          result = await processRecordingFinalize(job.payload);
        } else {
          throw new Error(`Unknown job type: ${job.type}`);
        }

        // Mark completed
        await adminDb
          .from("jobs")
          .update({
            status: "completed",
            result: result,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
        
        console.log(`[jobs] Completed job ${job.id}`);
        
        // Polling again immediately to clear backlog
        return setTimeout(() => pollJobs(io), 0);
      } catch (jobErr) {
        console.error(`[jobs] Error processing job ${job.id}:`, jobErr);
        // Mark failed
        await adminDb
          .from("jobs")
          .update({
            status: "failed",
            error: jobErr.message,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
      }
    }
  } catch (err) {
    if (err.message && !err.message.includes("claim")) {
      console.error("[jobs] Polling error:", err.message);
    }
  }

  // Poll again after interval
  if (isWorkerRunning) {
    pollingTimer = setTimeout(() => pollJobs(io), POLL_INTERVAL);
  }
}

// ----------------------------------------------------------------------
// Job Handlers
// ----------------------------------------------------------------------

async function processFileUpload(payload, io) {
  const { sessionId, fileId, originalname, mimetype, size, senderName, senderRole, storagePath, localFilePath } = payload;

  try {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file missing: ${localFilePath}`);
    }

    const fileBuffer = fs.readFileSync(localFilePath);

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await adminDb.storage
      .from("files")
      .upload(storagePath, fileBuffer, {
        contentType: mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = adminDb.storage
      .from("files")
      .getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // 2. Insert into Database
    const { data: sharedFile, error: dbError } = await adminDb
      .from("shared_files")
      .insert({
        id: fileId,
        session_id: sessionId,
        sender_name: senderName,
        file_name: originalname,
        mime_type: mimetype,
        file_size: size,
        file_url: fileUrl,
        created_at: new Date(),
      })
      .select()
      .single();

    if (dbError || !sharedFile) {
      await adminDb.storage.from("files").remove([storagePath]);
      throw new Error(`DB insert error: ${dbError?.message}`);
    }

    // 3. Emit to socket room
    const room = `session:${sessionId}`;
    io.to(room).emit("file-shared", {
      id: sharedFile.id,
      session_id: sharedFile.session_id,
      sender_name: sharedFile.sender_name,
      sender_role: senderRole,
      file_name: sharedFile.file_name,
      mime_type: sharedFile.mime_type,
      file_size: `${(sharedFile.file_size / (1024 * 1024)).toFixed(2)} MB`,
      file_url: sharedFile.file_url,
      created_at: sharedFile.created_at,
    });

    // 4. Cleanup local file
    try {
      fs.unlinkSync(localFilePath);
    } catch (_) {}

    return { success: true, fileUrl };
  } catch (err) {
    // Cleanup on fail
    try {
      if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    } catch (_) {}
    throw err;
  }
}

async function processRecordingFinalize(payload) {
  const { sessionId, recordingId, outputPath, sdpPath, aiEnabled } = payload;

  try {
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Recording file not found: ${outputPath}`);
    }

    const fileBuffer = fs.readFileSync(outputPath);

    // 1. Upload WebM buffer to 'recordings' bucket
    const { error: uploadError } = await adminDb.storage
      .from("recordings")
      .upload(`${sessionId}/${recordingId}.webm`, fileBuffer, {
        contentType: "video/webm",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL link
    const { data: urlData } = adminDb.storage
      .from("recordings")
      .getPublicUrl(`${sessionId}/${recordingId}.webm`);
    const fileUrl = urlData.publicUrl;

    // 2. Update DB status to ready
    const { error: dbError } = await adminDb
      .from("recordings")
      .update({
        status: "ready",
        file_url: fileUrl,
        updated_at: new Date(),
      })
      .eq("id", recordingId);

    if (dbError) throw dbError;

    // 3. Trigger AI analysis if enabled
    if (aiEnabled) {
      try {
        await triggerAnalysis(sessionId, recordingId, fileUrl);
      } catch (aiErr) {
        console.error(`[jobs] AI trigger failed for recording ${recordingId}:`, aiErr);
      }
    }

    // 4. Delete temp local files
    try {
      fs.unlinkSync(outputPath);
      if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);
    } catch (_) {}

    return { success: true, fileUrl };
  } catch (err) {
    // Mark failed in DB
    await adminDb
      .from("recordings")
      .update({
        status: "failed",
        updated_at: new Date(),
      })
      .eq("id", recordingId);

    // Cleanup local files
    try {
      if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (_) {}
    throw err;
  }
}
