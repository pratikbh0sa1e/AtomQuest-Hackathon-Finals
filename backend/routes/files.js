import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { db, adminDb } from "../supabase.js";

const router = Router();

// Configure multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB size limit
}).single("file");

// Allowed MIME types
const ALLOWED_MIMES = ["image/jpeg", "image/png", "application/pdf"];

/**
 * POST /sessions/:id/files
 * Auth required (any role). Uploads document/image to Supabase Storage.
 * Restricts upload count to 50 per session.
 * Rollback if DB insert or socket broadcast fails.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
router.post("/:id/files", (req, res) => {
  upload(req, res, async (err) => {
    const { id: sessionId } = req.params;

    // Handle multer limits check (Requirement 6.3)
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "File size exceeds 20MB limit",
          code: "FILE_TOO_LARGE",
        });
      }
      return res.status(400).json({ error: err.message, code: "UPLOAD_ERROR" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded", code: "MISSING_FILE" });
    }

    const { mimetype, size, originalname, buffer } = req.file;

    // Validate MIME type (Requirement 6.3)
    if (!ALLOWED_MIMES.includes(mimetype)) {
      return res.status(415).json({
        error: "Only JPEG, PNG, and PDF files are allowed",
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    }

    try {
      // Check session state
      const { data: session, error: sessionErr } = await db
        .from("sessions")
        .select("status")
        .eq("id", sessionId)
        .single();

      if (sessionErr || !session || session.status !== "active") {
        return res.status(404).json({ error: "Active session not found", code: "SESSION_NOT_FOUND" });
      }

      // 1. Verify session file limit: Max 50 files (Requirement 6.6)
      const { count, error: countError } = await db
        .from("shared_files")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);

      if (countError) {
        throw countError;
      }

      if (count >= 50) {
        return res.status(422).json({
          error: "Per-session file upload limit of 50 files has been reached",
          code: "FILE_LIMIT_EXCEEDED",
        });
      }

      const fileId = crypto.randomUUID();
      const storagePath = `${sessionId}/${fileId}-${originalname}`;

      // 2. Upload to Supabase Storage
      const { error: uploadError } = await adminDb.storage
        .from("files")
        .upload(storagePath, buffer, {
          contentType: mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("[files] Storage upload error:", uploadError);
        return res.status(500).json({ error: "Failed to upload file to storage", code: "STORAGE_UPLOAD_FAILED" });
      }

      // Get public URL
      const { data: urlData } = adminDb.storage
        .from("files")
        .getPublicUrl(storagePath);
      const fileUrl = urlData.publicUrl;

      // 3. Insert into Database
      const senderName = req.user?.name || "Participant";
      const senderRole = req.user?.role || "customer";

      const { data: sharedFile, error: dbError } = await db
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

      // Database rollback (Requirement 6.5)
      if (dbError || !sharedFile) {
        console.error("[files] DB insert error, rolling back storage:", dbError);
        await adminDb.storage.from("files").remove([storagePath]);
        return res.status(500).json({ error: "Failed to record shared file", code: "DATABASE_SAVE_FAILED" });
      }

      // 4. Emit to socket room and verify room presence (Requirement 6.5)
      const io = req.app.get("io");
      const room = `session:${sessionId}`;
      
      const socketsInRoom = io?.sockets.adapter.rooms.get(room);
      if (!socketsInRoom || socketsInRoom.size === 0) {
        console.warn(`[files] Socket broadcast failed (no clients in room ${room}). Rolling back.`);
        // Rollback DB and Storage
        await db.from("shared_files").delete().eq("id", fileId);
        await adminDb.storage.from("files").remove([storagePath]);
        return res.status(500).json({
          error: "Failed to broadcast file share. No active participants in session room.",
          code: "SOCKET_BROADCAST_FAILED",
        });
      }

      // Broadcast file metadata to all peers in the call
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

      return res.status(200).json(sharedFile);

    } catch (err) {
      console.error("[files] Upload exception:", err);
      return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  });
});

/**
 * GET /sessions/:id/files
 * Auth required. Returns all shared files for the session.
 * Requirements: 6.4, 6.7
 */
router.get("/:id/files", async (req, res) => {
  const { id: sessionId } = req.params;

  try {
    const { data: files, error } = await db
      .from("shared_files")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /files] DB fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch files list", code: "FETCH_FAILED" });
    }

    return res.json(files ?? []);
  } catch (err) {
    console.error("[GET /files] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
