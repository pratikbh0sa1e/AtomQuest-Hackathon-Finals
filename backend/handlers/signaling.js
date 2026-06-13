import jwt from "jsonwebtoken";
import {
  createRouter,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  registerTransport,
  sessionRouters,
  closePeer,
  closeSession,
  peerTransports,
} from "../mediasoup-worker.js";
import { db } from "../supabase.js";
import { reconnectTokens } from "../routes/auth.js";

const JWT_SECRET = process.env.JWT_SECRET;

// Map to track active reconnect window timeouts: Map<participantId, NodeJS.Timeout>
export const disconnectTimers = new Map();

// Map to track live call session summaries in-memory: Map<sessionId, Object>
export const activeSessions = new Map();

/**
 * Broadcasts list of active calls to the 'admin' socket room.
 */
export async function broadcastSessionsUpdate(io) {
  if (!io) return;
  const sessions = Array.from(activeSessions.values()).map((s) => ({
    id: s.id,
    agent: s.agent,
    customer: s.customer,
    duration: Math.floor((Date.now() - s.created_at_time) / 1000),
    invite_token: s.invite_token,
    status: s.status,
    participants_count: s.participants_count,
  }));
  io.to("admin").emit("sessions-update", { sessions });
}

/**
 * Register all Socket.IO signaling event handlers for a connected socket.
 *
 * socket.data.user is already set before this handler is called (set in server.js).
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerSignalingHandlers(io, socket) {
  const participantId = socket.data.user?.id || socket.data.user?.sub;

  // Reconnect check: if this participant has an active disconnect timer, verify token
  if (participantId && disconnectTimers.has(participantId)) {
    // Customers use reconnectToken; Agents just use their JWT auth.
    if (socket.data.user?.role === "customer") {
      const reconnectToken = socket.handshake.auth?.reconnectToken;
      const record = reconnectTokens.get(participantId);

      if (!record || record.token !== reconnectToken) {
        console.warn(
          `[signaling] Reconnect token mismatch for ${participantId}. Rejecting socket connection.`,
        );
        socket.disconnect(true);
        return;
      }
    }

    // Clear timer to prevent departure emit
    const timer = disconnectTimers.get(participantId);
    clearTimeout(timer);
    disconnectTimers.delete(participantId);

    console.log(
      `[signaling] Participant ${participantId} reconnected successfully within window.`,
    );

    // Restore connection status in DB
    db.from("participants")
      .update({ connection_status: "connected" })
      .eq("id", participantId)
      .then(({ error }) => {
        if (error) {
          console.error(
            "[signaling] Failed to restore connection_status:",
            error,
          );
        }
      });
  }

  // ---------------------------------------------------------------------------
  // admin:join
  // Add Agent socket to 'admin' room and emit current sessions summary.
  // ---------------------------------------------------------------------------
  socket.on("admin:join", async () => {
    if (
      socket.data.user?.role !== "agent" &&
      socket.data.user?.role !== "supervisor"
    )
      return;
    await socket.join("admin");
    const sessions = Array.from(activeSessions.values()).map((s) => ({
      id: s.id,
      agent: s.agent,
      customer: s.customer,
      duration: Math.floor((Date.now() - s.created_at_time) / 1000),
      invite_token: s.invite_token,
      status: s.status,
      participants_count: s.participants_count,
    }));
    socket.emit("sessions-update", { sessions });
  });

  // ---------------------------------------------------------------------------
  // session:join
  // Verify JWT, join Socket.IO room, create mediasoup router if needed,
  // emit session:joined with router RTP capabilities.
  // Requirements: 2.1, 2.2
  // ---------------------------------------------------------------------------
  socket.on("session:join", async ({ sessionId } = {}, ack) => {
    try {
      // Verify JWT from the handshake (double-check; server.js already validates)
      const token = socket.handshake.auth?.token;
      if (!token) {
        const err = { error: true, message: "No auth token provided" };
        if (typeof ack === "function") ack(err);
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        const err = { error: true, message: "Invalid or expired token" };
        if (typeof ack === "function") ack(err);
        return;
      }

      if (!sessionId) {
        const err = { error: true, message: "sessionId is required" };
        if (typeof ack === "function") ack(err);
        return;
      }

      const room = `session:${sessionId}`;

      // Join the Socket.IO room for this session
      await socket.join(room);

      // Store session context on the socket for later handlers
      socket.data.sessionId = sessionId;
      socket.data.room = room;

      // Update active sessions mapping in memory for supervisors
      if (socket.data.user) {
        if (!activeSessions.has(sessionId)) {
          const { data: session } = await db
            .from("sessions")
            .select("invite_token, created_at")
            .eq("id", sessionId)
            .single();

          activeSessions.set(sessionId, {
            id: sessionId,
            agent: "None",
            customer: "Connecting...",
            invite_token: session?.invite_token || "",
            status: "active",
            participants_count: 0,
            created_at_time: session
              ? new Date(session.created_at).getTime()
              : Date.now(),
            participants: new Map(),
          });
        }

        const summary = activeSessions.get(sessionId);
        if (summary) {
          summary.participants.set(socket.data.user.id || socket.id, {
            name:
              socket.data.user.name ||
              (socket.data.user.role === "agent" ? "Agent" : "Customer"),
            role: socket.data.user.role,
          });
          summary.participants_count = summary.participants.size;

          if (socket.data.user.role === "agent") {
            summary.agent = socket.data.user.name || "Agent";
          } else if (socket.data.user.role === "customer") {
            summary.customer = socket.data.user.name || "Customer";
          }

          await broadcastSessionsUpdate(io);
        }
      }

      // Create (or retrieve existing) mediasoup Router for this session
      const router = await createRouter(sessionId);

      // Auto-activate session in DB when first participant joins
      await db
        .from("sessions")
        .update({ status: "active" })
        .eq("id", sessionId)
        .eq("status", "pending");

      // Fetch existing chat history, shared files, and participants for this session
      const [
        { data: chatHistory }, 
        { data: participants }, 
        { data: sharedFiles }
      ] = await Promise.all([
        db
          .from("messages")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
        db
          .from("participants")
          .select("*")
          .eq("session_id", sessionId)
          .is("left_at", null),
        db
          .from("shared_files")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
      ]);

      const fileMessages = (sharedFiles || []).map((f) => ({
        id: f.id,
        sender_name: f.sender_name,
        sender_role: "agent", // Defaulting to agent since role is not stored
        content: "Shared a file",
        created_at: f.created_at,
        file: {
          id: f.id,
          file_name: f.file_name,
          mime_type: f.mime_type,
          file_size: `${(f.file_size / (1024 * 1024)).toFixed(2)} MB`,
          file_url: f.file_url,
        },
      }));

      const combinedMessages = [...(chatHistory || []), ...fileMessages].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );

      // Notify ALL existing peers in the room about this new participant's producers
      // so they can consume them
      const socketsInRoom = await io.in(room).fetchSockets();
      for (const s of socketsInRoom) {
        if (s.id === socket.id) continue;
        // Tell the new joiner about existing producers in the room
        s.emit("peer-joined", {
          socketId: socket.id,
          role: socket.data.user?.role,
        });
      }

      // Collect existing producers from all OTHER peers already in this session
      const existingProducers = [];
      const participantMap = peerTransports.get(sessionId);
      if (participantMap) {
        for (const [, peer] of participantMap) {
          if (peer.producers) {
            for (const p of peer.producers) {
              if (!p.closed) {
                existingProducers.push({ producerId: p.id, kind: p.kind });
              }
            }
          }
        }
      }

      // Emit session:joined with router RTP capabilities + history + existing producers
      socket.emit("session:joined", {
        routerRtpCapabilities: router.rtpCapabilities,
        participants: participants ?? [],
        messages: combinedMessages,
        existingProducers,
      });

      if (typeof ack === "function") {
        ack({ error: false, routerRtpCapabilities: router.rtpCapabilities });
      }
    } catch (err) {
      console.error("[signaling] session:join error:", err);
      if (typeof ack === "function") {
        ack({ error: true, message: err.message });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // transport:create
  // Client sends { direction: 'send' | 'recv' }.
  // Create WebRtcTransport, register it, emit transport:created with params.
  // Requirements: 2.1
  // ---------------------------------------------------------------------------
  socket.on("transport:create", async ({ direction } = {}, ack) => {
    try {
      const sessionId = socket.data.sessionId;
      if (!sessionId) {
        const err = { error: true, message: "Not joined to a session" };
        if (typeof ack === "function") ack(err);
        return;
      }

      if (direction !== "send" && direction !== "recv") {
        const err = {
          error: true,
          message: "direction must be 'send' or 'recv'",
        };
        if (typeof ack === "function") ack(err);
        return;
      }

      const router = sessionRouters.get(sessionId);
      if (!router) {
        const err = { error: true, message: "Router not found for session" };
        if (typeof ack === "function") ack(err);
        return;
      }

      const { transport, params } = await createWebRtcTransport(router);

      // Associate the transport with this participant
      const participantId = socket.data.user?.sub ?? socket.id;
      registerTransport(sessionId, participantId, direction, transport);

      // Emit transport:created to the client (in addition to ack)
      socket.emit("transport:created", { direction, params });

      if (typeof ack === "function") {
        ack({ error: false, params });
      }
    } catch (err) {
      console.error("[signaling] transport:create error:", err);
      if (typeof ack === "function") {
        ack({ error: true, message: err.message });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // transport:connect
  // Client sends { transportId, dtlsParameters }.
  // Connect the transport and ack success/error.
  // Requirements: 2.1
  // ---------------------------------------------------------------------------
  socket.on(
    "transport:connect",
    async ({ transportId, dtlsParameters } = {}, ack) => {
      try {
        if (!transportId || !dtlsParameters) {
          const err = {
            error: true,
            message: "transportId and dtlsParameters are required",
          };
          if (typeof ack === "function") ack(err);
          return;
        }

        await connectTransport(transportId, dtlsParameters);

        if (typeof ack === "function") {
          ack({ error: false });
        }
      } catch (err) {
        console.error("[signaling] transport:connect error:", err);
        if (typeof ack === "function") {
          ack({ error: true, message: err.message });
        }
      }
    },
  );

  // ---------------------------------------------------------------------------
  // transport:produce
  // Client sends { transportId, kind, rtpParameters }.
  // Produce media, notify other peers, ack { producerId }.
  // Requirements: 2.2
  // ---------------------------------------------------------------------------
  socket.on(
    "transport:produce",
    async ({ transportId, kind, rtpParameters } = {}, ack) => {
      try {
        if (!transportId || !kind || !rtpParameters) {
          const err = {
            error: true,
            message: "transportId, kind, and rtpParameters are required",
          };
          if (typeof ack === "function") ack(err);
          return;
        }

        const producer = await produce(transportId, kind, rtpParameters);
        const producerId = producer.id;

        // Notify all other peers in the session room about the new producer
        const room = socket.data.room;
        if (room) {
          socket.to(room).emit("new-producer", { producerId, kind });
        }

        if (typeof ack === "function") {
          ack({ error: false, producerId });
        }
      } catch (err) {
        console.error("[signaling] transport:produce error:", err);
        if (typeof ack === "function") {
          ack({ error: true, message: err.message });
        }
      }
    },
  );

  // ---------------------------------------------------------------------------
  // transport:consume
  // Client sends { transportId, producerId, rtpCapabilities }.
  // Create consumer, ack consumer params.
  // Requirements: 2.2
  // ---------------------------------------------------------------------------
  socket.on(
    "transport:consume",
    async ({ transportId, producerId, rtpCapabilities } = {}, ack) => {
      try {
        console.log(
          `[consume] Request from ${socket.data.user?.role || "unknown"}: transportId=${transportId}, producerId=${producerId}`,
        );

        if (!transportId || !producerId || !rtpCapabilities) {
          const err = {
            error: true,
            message:
              "transportId, producerId, and rtpCapabilities are required",
          };
          console.error("[consume] Missing required params:", err);
          if (typeof ack === "function") ack(err);
          return;
        }

        const consumerParams = await consume(
          transportId,
          producerId,
          rtpCapabilities,
        );

        console.log(
          `[consume] Success: consumerId=${consumerParams.id}, kind=${consumerParams.kind}`,
        );

        if (typeof ack === "function") {
          ack({ error: false, ...consumerParams });
        }
      } catch (err) {
        console.error(
          "[signaling] transport:consume error:",
          err.message || err,
        );
        if (typeof ack === "function") {
          ack({ error: true, message: err.message });
        }
      }
    },
  );

  // ---------------------------------------------------------------------------
  // media:mute
  // Broadcast mute state change to all other peers within 500ms (synchronous emit).
  // Requirements: 2.4
  // ---------------------------------------------------------------------------
  socket.on("media:mute", ({ enabled } = {}) => {
    const room = socket.data.room;
    const participantId = socket.data.user?.sub ?? socket.id;

    if (room) {
      socket.to(room).emit("peer-media-state", {
        participantId,
        kind: "audio",
        enabled: Boolean(enabled),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // media:camera
  // Broadcast camera state change to all other peers within 500ms (synchronous emit).
  // Requirements: 2.5
  // ---------------------------------------------------------------------------
  socket.on("media:camera", ({ enabled } = {}) => {
    const room = socket.data.room;
    const participantId = socket.data.user?.sub ?? socket.id;

    if (room) {
      socket.to(room).emit("peer-media-state", {
        participantId,
        kind: "video",
        enabled: Boolean(enabled),
      });
    }
  });

  // ---------------------------------------------------------------------------
  // chat:send
  // Validate content (≤10,000 chars, non-empty after trim).
  // Insert into messages table.
  // Broadcast chat:message to session room.
  // Ack error on validation fail or DB fail (do not broadcast on DB fail).
  // Requirements: 3.1, 3.2, 3.4, 3.5, 3.6
  // ---------------------------------------------------------------------------
  socket.on("chat:send", async ({ content } = {}, ack) => {
    try {
      // Validation: non-empty after trim
      if (typeof content !== "string" || content.trim().length === 0) {
        if (typeof ack === "function") {
          ack({ error: true, message: "Message cannot be empty" });
        }
        return;
      }

      // Validation: max 10,000 characters
      if (content.length > 10000) {
        if (typeof ack === "function") {
          ack({
            error: true,
            message: "Message exceeds maximum length of 10,000 characters",
          });
        }
        return;
      }

      const sessionId = socket.data.sessionId;
      const user = socket.data.user;

      if (!sessionId) {
        if (typeof ack === "function") {
          ack({ error: true, message: "Not joined to a session" });
        }
        return;
      }

      const senderRole = user?.role ?? "customer";
      const senderName = user?.name ?? "Anonymous";

      // Insert message into DB
      const { data: message, error: dbError } = await db
        .from("messages")
        .insert({
          session_id: sessionId,
          sender_role: senderRole,
          sender_name: senderName,
          content,
          created_at: new Date(),
        })
        .select()
        .single();

      if (dbError) {
        console.error("[signaling] chat:send DB error:", dbError);
        if (typeof ack === "function") {
          ack({ error: true, message: "Failed to save message" });
        }
        // Do NOT broadcast on DB failure (Requirement 3.6)
        return;
      }

      // Build broadcast payload with consistent field names
      const payload = {
        id: message.id,
        session_id: sessionId,
        sender_name: senderName,
        sender_role: senderRole,
        content,
        created_at: message.created_at,
      };

      // Broadcast to all other participants in the session room
      const room = socket.data.room;
      if (room) {
        socket.to(room).emit("chat:message", payload);
      }

      if (typeof ack === "function") {
        ack({ error: false, message: payload });
      }
    } catch (err) {
      console.error("[signaling] chat:send error:", err);
      if (typeof ack === "function") {
        ack({ error: true, message: "Internal server error" });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // session:end
  // Agent requests call session termination cleanly.
  // ---------------------------------------------------------------------------
  socket.on("session:end", async ({ sessionId } = {}, ack) => {
    try {
      if (
        socket.data.user?.role !== "agent" &&
        socket.data.user?.role !== "supervisor"
      ) {
        if (typeof ack === "function")
          ack({ error: true, message: "Forbidden" });
        return;
      }

      const room = `session:${sessionId}`;

      // Emit termination to room
      io.to(room).emit("session-terminated");

      // Close SFU transports
      try {
        closeSession(sessionId);
      } catch (err) {
        console.error(`[signaling] closeSession failed for ${sessionId}:`, err);
      }

      // Disconnect all sockets in that room
      io.in(room).disconnectSockets(true);

      // Update session status in DB
      const now = new Date().toISOString();
      await db
        .from("sessions")
        .update({ status: "ended", ended_at: now })
        .eq("id", sessionId);

      // Update participants
      const { data: participants } = await db
        .from("participants")
        .select("*")
        .eq("session_id", sessionId)
        .is("left_at", null);

      if (participants && participants.length > 0) {
        const updates = participants.map((p) => {
          const duration = p.joined_at
            ? Math.floor((Date.now() - new Date(p.joined_at).getTime()) / 1000)
            : 0;
          return db
            .from("participants")
            .update({
              duration,
              left_at: now,
              connection_status: "disconnected",
            })
            .eq("id", p.id);
        });
        await Promise.all(updates);
      }

      // Remove from activeSessions
      activeSessions.delete(sessionId);
      await broadcastSessionsUpdate(io);

      if (typeof ack === "function") ack({ error: false });
    } catch (err) {
      console.error("[signaling] session:end error:", err);
      if (typeof ack === "function") ack({ error: true, message: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // disconnect
  // Update connection_status = 'disconnected' in DB.
  // Full reconnect window logic is handled in task 18.
  // Requirements: 7.1
  // ---------------------------------------------------------------------------
  socket.on("disconnect", async () => {
    try {
      const participantId = socket.data.user?.id || socket.data.user?.sub;
      const sessionId = socket.data.sessionId;
      const room = socket.data.room;

      if (!participantId || !sessionId) return;

      // Update participant connection status in DB to 'disconnected'
      await db
        .from("participants")
        .update({ connection_status: "disconnected" })
        .eq("id", participantId);

      // Start 30-second reconnect window timeout (Requirement 7.1)
      const timeoutId = setTimeout(async () => {
        disconnectTimers.delete(participantId);
        reconnectTokens.delete(participantId);

        // Close peer transports, producers, and consumers in mediasoup
        closePeer(sessionId, participantId);

        // Clean up from in-memory active sessions mapping
        const summary = activeSessions.get(sessionId);
        if (summary) {
          summary.participants.delete(participantId);
          summary.participants_count = summary.participants.size;
          if (summary.participants_count === 0) {
            activeSessions.delete(sessionId);
          } else {
            if (socket.data.user?.role === "agent") summary.agent = "None";
            if (socket.data.user?.role === "customer")
              summary.customer = "Connecting...";
          }
          await broadcastSessionsUpdate(io);
        }

        // Broadcast departure event to room (Requirement 7.3)
        if (room) {
          io.to(room).emit("participant-left", { participantId });
        }

        console.log(
          `[signaling] Reconnect window expired for participant ${participantId}. Cleaned up resources.`,
        );
      }, 30000);

      disconnectTimers.set(participantId, timeoutId);
      console.log(
        `[signaling] Participant ${participantId} disconnected. Reconnect window timer started.`,
      );
    } catch (err) {
      console.error("[signaling] disconnect handler error:", err);
    }
  });
}
