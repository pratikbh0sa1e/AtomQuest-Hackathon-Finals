import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
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
import analysisRouter from "./routes/analysis.js";
import adminRouter from "./routes/admin.js";
import { incrementError } from "./metrics.js";
import { onRecordingReady } from "./recording-manager.js";
import { triggerAnalysis } from "./ai-client.js";

const app = express();
const httpServer = createServer(app);

// Attach Socket.IO to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Set io instance on app context to decouple handlers
app.set("io", io);

// Auth routes
app.use("/auth", authRouter);

// Files route (accessible to both agents and customers)
app.use("/sessions", authenticate, filesRouter);

// Session and Recording routes (agent only)
app.use("/sessions", authenticate, requireRole("agent"), sessionsRouter);
app.use("/sessions", authenticate, requireRole("agent"), recordingsRouter);

// Analysis route (agent only) — Requirements 10.3, 10.4, 10.5
app.use("/sessions", authenticate, requireRole("agent"), analysisRouter);

// Admin route (admin only) - Requirements 8.1, 8.2, 8.3, 8.4, 8.6
app.use("/admin", authenticate, requireRole("admin"), adminRouter);

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
onRecordingReady(triggerAnalysis);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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
