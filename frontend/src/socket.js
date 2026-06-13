import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Module-level singleton state
let socketInstance = null;
let currentToken = null;

/**
 * Returns the existing socket if the token matches, otherwise creates a new one.
 * The socket is created with autoConnect: false — call socket.connect() explicitly.
 *
 * @param {string} token - JWT or invite token for socket handshake auth
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket(token) {
  if (socketInstance && currentToken === token) {
    return socketInstance;
  }

  // Token changed or no socket yet — disconnect old one and create fresh
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  socketInstance = io(BACKEND_URL, {
    auth: { token },
    autoConnect: false,
  });

  currentToken = token;
  return socketInstance;
}

/**
 * Returns the current socket instance without creating a new one.
 * @returns {import('socket.io-client').Socket | null}
 */
export function getSocketInstance() {
  return socketInstance;
}

/**
 * Creates (or reuses) a socket for the given token, connects it, and returns it.
 * Also sets the module-level `socket` proxy so callers can use `socket.emit(...)` directly.
 * @param {string} token
 * @param {string} [role]
 * @param {string} [name]
 * @returns {import('socket.io-client').Socket}
 */
export function connectSocket(token, role, name) {
  const s = getSocket(token);
  // Store extra identity info on auth so the server can read it
  s.auth = { token, role, name };
  if (!s.connected) {
    s.connect();
  }
  socketInstance = s;
  return s;
}

/**
 * Disconnects the current socket and clears the singleton.
 */
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    currentToken = null;
  }
}

/**
 * Proxy object so callers can do `socket.emit(...)` / `socket.on(...)` directly
 * without holding a reference to the instance at import time.
 * Always delegates to the current `socketInstance`.
 */
export const socket = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!socketInstance) {
        throw new Error(
          `socket.${String(prop)}() called before connectSocket()`,
        );
      }
      const val = socketInstance[prop];
      return typeof val === "function" ? val.bind(socketInstance) : val;
    },
    set(_target, prop, value) {
      if (socketInstance) socketInstance[prop] = value;
      return true;
    },
  },
);

// ---------------------------------------------------------------------------
// Typed event emitter wrappers
// ---------------------------------------------------------------------------

/**
 * Join a support session room.
 * @param {string} sessionId
 */
export function joinSession(sessionId) {
  socketInstance.emit("session:join", { sessionId });
}

/**
 * Send a chat message with an acknowledgement callback.
 * @param {string} content
 * @param {(err: object | null, result?: object) => void} cb
 */
export function sendChat(content, cb) {
  socketInstance.emit("chat:send", { content }, cb);
}

/**
 * Broadcast local mute state to the session.
 * @param {boolean} enabled - true = muted
 */
export function emitMute(enabled) {
  socketInstance.emit("media:mute", { enabled });
}

/**
 * Broadcast local camera state to the session.
 * @param {boolean} enabled - true = camera on
 */
export function emitCamera(enabled) {
  socketInstance.emit("media:camera", { enabled });
}

// ---------------------------------------------------------------------------
// Typed event listener wrappers
// ---------------------------------------------------------------------------

/**
 * Subscribe to incoming chat messages.
 * @param {(payload: object) => void} cb
 */
export function onChatMessage(cb) {
  socketInstance.on("chat:message", cb);
}

/**
 * Subscribe to peer media state changes (mute / camera).
 * @param {(payload: object) => void} cb
 */
export function onPeerMediaState(cb) {
  socketInstance.on("peer-media-state", cb);
}

/**
 * Subscribe to new producer announcements from other peers.
 * @param {(payload: object) => void} cb
 */
export function onNewProducer(cb) {
  socketInstance.on("new-producer", cb);
}

/**
 * Subscribe to session-terminated events (agent / admin force-end).
 * @param {(payload: object) => void} cb
 */
export function onSessionTerminated(cb) {
  socketInstance.on("session-terminated", cb);
}
