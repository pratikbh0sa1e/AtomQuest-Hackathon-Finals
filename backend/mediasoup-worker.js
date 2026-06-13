import mediasoup from "mediasoup";

// Media codecs for opus (audio) and VP8 (video)
const mediaCodecs = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
];

// Create mediasoup Worker at module init time (top-level await supported with "type": "module")
const worker = await mediasoup.createWorker({
  logLevel: "warn",
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
});

worker.on("died", (error) => {
  console.error("mediasoup worker died:", error);
  process.exit(1);
});

// sessionRouters: Map<sessionId, Router>
export const sessionRouters = new Map();

// peerTransports: Map<sessionId, Map<participantId, { send, recv, producers, consumers }>>
export const peerTransports = new Map();

// Internal helper: find a transport across all sessions/participants by transportId
function findTransport(transportId) {
  for (const [, participantMap] of peerTransports) {
    for (const [, peer] of participantMap) {
      if (peer.send && peer.send.id === transportId) return peer.send;
      if (peer.recv && peer.recv.id === transportId) return peer.recv;
    }
  }
  return null;
}

// Internal helper: find the peer entry that owns a transport
function findPeerByTransport(transportId) {
  for (const [sessionId, participantMap] of peerTransports) {
    for (const [participantId, peer] of participantMap) {
      if (
        (peer.send && peer.send.id === transportId) ||
        (peer.recv && peer.recv.id === transportId)
      ) {
        return { sessionId, participantId, peer };
      }
    }
  }
  return null;
}

/**
 * Create a Router for a session, storing it in sessionRouters.
 * @param {string} sessionId
 * @returns {mediasoup.types.Router}
 */
export async function createRouter(sessionId) {
  if (sessionRouters.has(sessionId)) {
    return sessionRouters.get(sessionId);
  }
  const router = await worker.createRouter({ mediaCodecs });
  sessionRouters.set(sessionId, router);
  return router;
}

/**
 * Create a WebRtcTransport on the given router.
 * @param {mediasoup.types.Router} router
 * @returns {{ transport: mediasoup.types.WebRtcTransport, params: { id, iceParameters, iceCandidates, dtlsParameters } }}
 */
export async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: "0.0.0.0",
        announcedIp: process.env.ANNOUNCED_IP || "127.0.0.1",
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  const params = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };

  return { transport, params };
}

/**
 * Connect a transport by its ID with the given DTLS parameters.
 * @param {string} transportId
 * @param {object} dtlsParameters
 */
export async function connectTransport(transportId, dtlsParameters) {
  const transport = findTransport(transportId);
  if (!transport) {
    throw new Error(`Transport not found: ${transportId}`);
  }
  await transport.connect({ dtlsParameters });
}

/**
 * Produce media on the given transport.
 * Stores the producer in the peer's producers array.
 * @param {string} transportId
 * @param {string} kind - 'audio' | 'video'
 * @param {object} rtpParameters
 * @returns {mediasoup.types.Producer}
 */
export async function produce(transportId, kind, rtpParameters) {
  const transport = findTransport(transportId);
  if (!transport) {
    throw new Error(`Transport not found: ${transportId}`);
  }

  const producer = await transport.produce({ kind, rtpParameters });

  // Store producer in the peer entry
  const result = findPeerByTransport(transportId);
  if (result) {
    result.peer.producers.push(producer);
  }

  return producer;
}

/**
 * Consume a producer on the given transport.
 * Stores the consumer in the peer's consumers array and returns consumer params.
 * @param {string} transportId
 * @param {string} producerId
 * @param {object} rtpCapabilities
 * @returns {{ id, producerId, kind, rtpParameters }}
 */
export async function consume(transportId, producerId, rtpCapabilities) {
  const transport = findTransport(transportId);
  if (!transport) {
    throw new Error(`Transport not found: ${transportId}`);
  }

  // Find the router for this transport to check canConsume
  const result = findPeerByTransport(transportId);
  if (!result) {
    throw new Error(`Peer not found for transport: ${transportId}`);
  }

  const router = sessionRouters.get(result.sessionId);
  if (!router) {
    throw new Error(`Router not found for session: ${result.sessionId}`);
  }

  if (!router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error("Cannot consume: incompatible RTP capabilities");
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false,
  });

  // Store consumer in the peer entry
  result.peer.consumers.push(consumer);

  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

/**
 * Register a transport under a specific session + participant.
 * Call this after createWebRtcTransport to associate the transport with a peer.
 * @param {string} sessionId
 * @param {string} participantId
 * @param {'send'|'recv'} direction
 * @param {mediasoup.types.WebRtcTransport} transport
 */
export function registerTransport(
  sessionId,
  participantId,
  direction,
  transport,
) {
  if (!peerTransports.has(sessionId)) {
    peerTransports.set(sessionId, new Map());
  }
  const participantMap = peerTransports.get(sessionId);

  if (!participantMap.has(participantId)) {
    participantMap.set(participantId, {
      send: null,
      recv: null,
      producers: [],
      consumers: [],
    });
  }
  const peer = participantMap.get(participantId);
  peer[direction] = transport;
}

/**
 * Close all transports for a participant and remove them from peerTransports.
 * @param {string} sessionId
 * @param {string} participantId
 */
export function closePeer(sessionId, participantId) {
  const participantMap = peerTransports.get(sessionId);
  if (!participantMap) return;

  const peer = participantMap.get(participantId);
  if (!peer) return;

  // Close all producers
  for (const producer of peer.producers) {
    try {
      producer.close();
    } catch (_) {
      /* ignore */
    }
  }
  // Close all consumers
  for (const consumer of peer.consumers) {
    try {
      consumer.close();
    } catch (_) {
      /* ignore */
    }
  }
  // Close transports
  if (peer.send) {
    try {
      peer.send.close();
    } catch (_) {
      /* ignore */
    }
  }
  if (peer.recv) {
    try {
      peer.recv.close();
    } catch (_) {
      /* ignore */
    }
  }

  participantMap.delete(participantId);

  // Clean up empty session map
  if (participantMap.size === 0) {
    peerTransports.delete(sessionId);
  }
}

/**
 * Close all participants and the Router for a session.
 * @param {string} sessionId
 */
export function closeSession(sessionId) {
  const participantMap = peerTransports.get(sessionId);
  if (participantMap) {
    for (const participantId of [...participantMap.keys()]) {
      closePeer(sessionId, participantId);
    }
  }

  const router = sessionRouters.get(sessionId);
  if (router) {
    try {
      router.close();
    } catch (_) {
      /* ignore */
    }
    sessionRouters.delete(sessionId);
  }
}

/**
 * Returns an array of transport IDs for all participants in a session.
 * @param {string} sessionId
 * @returns {string[]}
 */
export function getSessionTransports(sessionId) {
  const participantMap = peerTransports.get(sessionId);
  if (!participantMap) return [];

  const ids = [];
  for (const [, peer] of participantMap) {
    if (peer.send) ids.push(peer.send.id);
    if (peer.recv) ids.push(peer.recv.id);
  }
  return ids;
}

export { worker };
