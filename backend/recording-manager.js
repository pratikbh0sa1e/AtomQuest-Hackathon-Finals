import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import dgram from "dgram";
import crypto from "crypto";
import { db, adminDb } from "./supabase.js";
import { peerTransports, sessionRouters } from "./mediasoup-worker.js";
import { triggerAnalysis } from "./ai-client.js";

// Map to track active recordings: Map<sessionId, { ffmpegProcess, audioTransport, videoTransport, audioConsumer, videoConsumer, sdpPath, outputPath, recordingId }>
export const activeRecordings = new Map();

// Callbacks for ready recordings (e.g. AI analysis trigger)
const readyCallbacks = new Set();

/**
 * Finds a free UDP port on the host dynamically by binding to 0.
 * @returns {Promise<number>}
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.bind(0, () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
    socket.on("error", (err) => reject(err));
  });
}

/**
 * Register callback to trigger when a recording is ready.
 * @param {Function} cb - (sessionId, recordingId, fileUrl) => void
 */
export function onRecordingReady(cb) {
  readyCallbacks.add(cb);
}

/**
 * Starts recording the active producers in a session.
 * @param {string} sessionId
 * @returns {Promise<{ recordingId: string }>}
 */
export async function startRecording(sessionId) {
  if (activeRecordings.has(sessionId)) {
    throw new Error("Recording is already active for this session");
  }

  const router = sessionRouters.get(sessionId);
  if (!router) {
    throw new Error(`Mediasoup router not found for session: ${sessionId}`);
  }

  // 1. Locate active producers for this session
  const participantMap = peerTransports.get(sessionId);
  if (!participantMap || participantMap.size === 0) {
    throw new Error("No active participants to record");
  }

  let audioProducer = null;
  let videoProducer = null;

  for (const [, peer] of participantMap) {
    if (peer.producers) {
      for (const p of peer.producers) {
        if (p.kind === "audio" && !audioProducer) audioProducer = p;
        if (p.kind === "video" && !videoProducer) videoProducer = p;
      }
    }
  }

  if (!audioProducer || !videoProducer) {
    throw new Error("Missing active audio or video producer in session");
  }

  // 2. Allocate free UDP ports for ffmpeg listener
  const audioFfmpegPort = await findFreePort();
  const videoFfmpegPort = await findFreePort();

  // 3. Create PlainRtpTransports for routing streams
  const audioTransport = await router.createPlainTransport({
    listenIp: { ip: "127.0.0.1" },
    rtcpMux: true,
    comedia: false,
  });

  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: "127.0.0.1" },
    rtcpMux: true,
    comedia: false,
  });

  // Connect plain transports to local ffmpeg receiver ports
  await audioTransport.connect({ ip: "127.0.0.1", port: audioFfmpegPort });
  await videoTransport.connect({ ip: "127.0.0.1", port: videoFfmpegPort });

  // 4. Consume audio/video streams on plain transports
  const audioConsumer = await audioTransport.consume({
    producerId: audioProducer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  const videoConsumer = await videoTransport.consume({
    producerId: videoProducer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  // 5. Generate SDP description file
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const recordingId = crypto.randomUUID();
  const sdpPath = path.join(tempDir, `${sessionId}-${recordingId}.sdp`);
  const outputPath = path.join(tempDir, `${sessionId}-${recordingId}.webm`);

  const audioPayloadType = audioConsumer.rtpParameters.codecs[0].payloadType;
  const videoPayloadType = videoConsumer.rtpParameters.codecs[0].payloadType;

  const sdpContent = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=Mediasoup Recording
t=0 0
m=audio ${audioFfmpegPort} RTP/AVP ${audioPayloadType}
c=IN IP4 127.0.0.1
a=rtpmap:${audioPayloadType} opus/48000/2
m=video ${videoFfmpegPort} RTP/AVP ${videoPayloadType}
c=IN IP4 127.0.0.1
a=rtpmap:${videoPayloadType} VP8/90000
`;

  fs.writeFileSync(sdpPath, sdpContent);

  // 6. Spawn ffmpeg to record Plain RTP stream
  const ffmpegProcess = spawn("ffmpeg", [
    "-y",
    "-protocol_whitelist",
    "file,rtp,udp",
    "-i",
    sdpPath,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    outputPath,
  ]);

  ffmpegProcess.on("error", (err) => {
    console.error(
      `[recording] ffmpeg spawn error for session ${sessionId}:`,
      err,
    );
  });

  // 7. Insert recording record in DB
  const { error: dbError } = await db.from("recordings").insert({
    id: recordingId,
    session_id: sessionId,
    status: "recording",
    created_at: new Date(),
    updated_at: new Date(),
  });

  if (dbError) {
    console.error("[recording] DB insertion error:", dbError);
    // Cleanup if DB fails
    ffmpegProcess.kill("SIGKILL");
    audioConsumer.close();
    videoConsumer.close();
    audioTransport.close();
    videoTransport.close();
    try {
      fs.unlinkSync(sdpPath);
    } catch (_) {}
    throw new Error("Failed to persist recording session in database");
  }

  // Store in active record map
  activeRecordings.set(sessionId, {
    ffmpegProcess,
    audioTransport,
    videoTransport,
    audioConsumer,
    videoConsumer,
    sdpPath,
    outputPath,
    recordingId,
  });

  console.log(
    `[recording] Started recording for session ${sessionId} (ID: ${recordingId})`,
  );
  return { recordingId };
}

/**
 * Stops an active session recording, triggers upload, and initiates AI post-call flow.
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function stopRecording(sessionId) {
  const recordingContext = activeRecordings.get(sessionId);
  if (!recordingContext) {
    throw new Error(`No active recording found for session: ${sessionId}`);
  }

  activeRecordings.delete(sessionId);

  const {
    ffmpegProcess,
    audioTransport,
    videoTransport,
    audioConsumer,
    videoConsumer,
    sdpPath,
    outputPath,
    recordingId,
  } = recordingContext;

  console.log(
    `[recording] Stopping recording for session ${sessionId} (ID: ${recordingId})`,
  );

  // Close consumers and transports first to stop sending packet traffic
  audioConsumer.close();
  videoConsumer.close();
  audioTransport.close();
  videoTransport.close();

  // Cleanly terminate ffmpeg
  return new Promise((resolve, reject) => {
    ffmpegProcess.on("exit", async () => {
      console.log(
        `[recording] ffmpeg closed. Starting post-processing for session ${sessionId}`,
      );

      // Update status to processing
      await db
        .from("recordings")
        .update({ status: "processing", updated_at: new Date() })
        .eq("id", recordingId);

      // Insert background job for finalization
      const { error: jobError } = await adminDb.from("jobs").insert({
        type: "RECORDING_FINALIZE",
        payload: {
          sessionId,
          recordingId,
          outputPath,
          sdpPath,
          aiEnabled: process.env.AI_SERVICE_ENABLED === "true"
        }
      });

      if (jobError) {
        console.error(`[recording] Failed to queue finalization job for ${recordingId}:`, jobError);
        reject(jobError);
      } else {
        console.log(`[recording] Finalization job queued for ${recordingId}`);
        resolve();
      }
    });

    // Send SIGINT for clean exit (flushes buffers)
    ffmpegProcess.kill("SIGINT");
  });
}

/**
 * Internal: Uploads local WebM archive to Supabase Storage, sets status 'ready', and runs callbacks.
 */
async function uploadRecordingAndFinalize(
  sessionId,
  recordingId,
  outputPath,
  sdpPath,
) {
  try {
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Recording file not found: ${outputPath}`);
    }

    const fileBuffer = fs.readFileSync(outputPath);

    // Upload WebM buffer to 'recordings' bucket
    const { data: uploadData, error: uploadError } = await adminDb.storage
      .from("recordings")
      .upload(`${sessionId}/${recordingId}.webm`, fileBuffer, {
        contentType: "video/webm",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL link
    const { data: urlData } = adminDb.storage
      .from("recordings")
      .getPublicUrl(`${sessionId}/${recordingId}.webm`);

    const fileUrl = urlData.publicUrl;

    // Update status to ready
    const { error: dbError } = await db
      .from("recordings")
      .update({
        status: "ready",
        file_url: fileUrl,
        updated_at: new Date(),
      })
      .eq("id", recordingId);

    if (dbError) {
      throw dbError;
    }

    console.log(
      `[recording] Recording ${recordingId} uploaded and marked ready. URL: ${fileUrl}`,
    );

    // Trigger AI or post-call callback handlers
    for (const cb of readyCallbacks) {
      try {
        cb(sessionId, recordingId, fileUrl);
      } catch (err) {
        console.error("[recording] Error in onRecordingReady callback:", err);
      }
    }

    // Trigger AI analysis if enabled — Requirement 10.1
    if (process.env.AI_SERVICE_ENABLED === "true") {
      triggerAnalysis(sessionId, recordingId, fileUrl).catch((err) => {
        console.error("[recording] triggerAnalysis error:", err);
      });
    }

    // Delete temp local files
    try {
      fs.unlinkSync(outputPath);
      fs.unlinkSync(sdpPath);
    } catch (_) {}
  } catch (err) {
    console.error(
      `[recording] Failed finalizing recording ${recordingId}:`,
      err,
    );

    await db
      .from("recordings")
      .update({
        status: "failed",
        updated_at: new Date(),
      })
      .eq("id", recordingId);

    // Delete sdp file anyway
    try {
      fs.unlinkSync(sdpPath);
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (_) {}
  }
}
