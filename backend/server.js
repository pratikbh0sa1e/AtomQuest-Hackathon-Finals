import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { worker, closeSession, sessionRouters } from "./mediasoup-worker.js";
import authRouter from "./routes/auth.js";
import { authenticate } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import sessionsRouter from "./routes/sessions.js";
import recordingsRouter from "./routes/recordings.js";
import filesRouter from "./routes/files.js";
import { registerSignalingHandlers } from "./handlers/signaling.js";
import metricsRouter from "./routes/metrics.js";
// import analysisRouter from "./routes/analysis.js";
import adminRouter from "./routes/admin.js";
import { incrementError } from "./metrics.js";
import { onRecordingReady } from "./recording-manager.js";
// import { triggerAnalysis } from "./ai-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let httpServer;
let isHttps = false;

try {
  const keyPath = path.join(__dirname, "key.pem");
  const certPath = path.join(__dirname, "cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const credentials = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    httpServer = createHttpsServer(credentials, app);
    isHttps = true;
  } else {
    console.warn("[server] SSL certificates not found. Falling back to HTTP.");
    httpServer = createHttpServer(app);
  }
} catch (err) {
  console.error("[server] Failed to start HTTPS server, falling back to HTTP:", err);
  httpServer = createHttpServer(app);
}

// Attach Socket.IO to the HTTP server
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
      "http://localhost:5173",
      "http://192.168.137.1:5173",
      "http://10.102.117.202:5173",
    ];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl or testing tools)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// Set io instance on app context to decouple handlers
app.set("io", io);

// Auth routes
app.use("/auth", authRouter);

// Files route (accessible to both agents and customers)
app.use("/sessions", authenticate, filesRouter);

// Session and Recording routes (agent or supervisor)
app.use(
  "/sessions",
  authenticate,
  requireRole("agent", "supervisor"),
  sessionsRouter,
);
app.use(
  "/sessions",
  authenticate,
  requireRole("agent", "supervisor"),
  recordingsRouter,
);

// Analysis route (agent only) — Requirements 10.3, 10.4, 10.5
// app.use("/sessions", authenticate, requireRole("agent"), analysisRouter);

// Admin route — supervisor role ONLY
app.use(
  "/admin",
  authenticate,
  requireRole("supervisor"),
  adminRouter,
);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Metrics endpoint — auth handled inside the route (no auth middleware here)
// Requirement 9.1, 9.4, 9.5
app.use("/metrics", metricsRouter);

// Global error handler — Requirement 9.3
// Must be defined after all routes so it catches errors from them.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  incrementError(status >= 500 ? "server_error" : "client_error");
  res.status(status).json({ error: err.message || "Internal server error" });
});

// Socket.IO connection handler — Requirements 4.2, 4.3
// Authenticate JWT from socket.handshake.auth.token before allowing any signaling.
io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    console.warn(`[socket] No auth token — disconnecting ${socket.id}`);
    socket.disconnect(true);
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.warn(
      `[socket] Invalid/expired token — disconnecting ${socket.id}:`,
      err.message,
    );
    socket.disconnect(true);
    return;
  }

  // Attach verified user identity to the socket for downstream handlers
  socket.data.user = {
    role: payload.role,
    id: payload.sub,
    sessionId: payload.sessionId ?? null,
  };

  console.log(`Socket connected: ${socket.id} (role=${socket.data.user.role})`);

  // Register all signaling event handlers for this authenticated socket
  registerSignalingHandlers(io, socket);
});

// Register AI analysis trigger callback
// onRecordingReady(triggerAnalysis);

// Start server
const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0"; // bind to all interfaces (LAN + localhost)
httpServer.listen(PORT, HOST, async () => {
  console.log(`Server listening on ${isHttps ? "https" : "http"}://${HOST}:${PORT}`);

  // On startup: mark any lingering 'active' sessions as 'ended'
  // (sessions left active from a previous server crash / restart)
  try {
    const { db } = await import("./supabase.js");
    const { error } = await db
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("status", "active");
    if (error) {
      console.warn(
        "[startup] Could not clean stale active sessions:",
        error.message,
      );
    } else {
      console.log("[startup] Stale active sessions marked as ended.");
    }
  } catch (err) {
    console.warn("[startup] Stale session cleanup skipped:", err.message);
  }
});

// Graceful shutdown — Requirements 2.6, 2.7
async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Close all active SFU sessions
  for (const sessionId of [...sessionRouters.keys()]) {
    try {
      closeSession(sessionId);
    } catch (err) {
      console.error(`Error closing session ${sessionId}:`, err);
    }
  }

  // Close the mediasoup worker
  try {
    worker.close();
  } catch (err) {
    console.error("Error closing mediasoup worker:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Track unhandled errors for metrics — Requirement 9.3
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  incrementError("internal_error");
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  incrementError("internal_error");
});

export { app, io, httpServer };
