import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { db, adminDb } from "../supabase.js";

const router = Router();

import fs from "fs";
import path from "path";

// Ensure temp directory exists
const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer disk storage for background processing
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
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

    const { mimetype, size, originalname, path: localFilePath } = req.file;

    // Validate MIME type (Requirement 6.3)
    if (!ALLOWED_MIMES.includes(mimetype)) {
      fs.unlinkSync(localFilePath);
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
        fs.unlinkSync(localFilePath);
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
        fs.unlinkSync(localFilePath);
        return res.status(422).json({
          error: "Per-session file upload limit of 50 files has been reached",
          code: "FILE_LIMIT_EXCEEDED",
        });
      }

      const fileId = crypto.randomUUID();
      const storagePath = `${sessionId}/${fileId}-${originalname}`;
      const senderName = req.user?.name || "Participant";
      const senderRole = req.user?.role || "customer";

      // Insert job into database for background processing
      const { error: jobError } = await adminDb.from("jobs").insert({
        type: "FILE_UPLOAD",
        payload: {
          sessionId,
          fileId,
          originalname,
          mimetype,
          size,
          senderName,
          senderRole,
          storagePath,
          localFilePath
        }
      });

      if (jobError) {
        throw jobError;
      }

      return res.status(202).json({ 
        message: "File upload queued for processing", 
        fileId 
      });

    } catch (err) {
      console.error("[files] Upload exception:", err);
      try {
        fs.unlinkSync(localFilePath);
      } catch (_) {}
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
