import { Device } from "mediasoup-client";

let device = null;
let sendTransport = null;
let recvTransport = null;
let sendTransportConnected = false;
let recvTransportConnected = false;

/**
 * Creates a mediasoup Device and loads it with the router's RTP capabilities.
 * @param {Object} routerRtpCapabilities - RTP capabilities from the server router
 * @returns {Promise<Device>} The loaded device
 */
export async function loadDevice(routerRtpCapabilities) {
  device = new Device();
  await device.load({ routerRtpCapabilities });
  return device;
}

/**
 * Creates a send transport and wires the connect and produce signaling events.
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} params - Transport params from the server (id, iceParameters, iceCandidates, dtlsParameters)
 * @returns {Object} The send transport
 */
export function createSendTransport(socket, params) {
  sendTransport = device.createSendTransport(params);
  sendTransportConnected = false;

  sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    if (sendTransportConnected) {
      callback();
      return;
    }
    sendTransportConnected = true;
    socket.emit(
      "transport:connect",
      { transportId: sendTransport.id, dtlsParameters },
      (response) => {
        if (response?.error)
          errback(new Error(response.message || "connect failed"));
        else callback();
      },
    );
  });

  sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
    socket.emit(
      "transport:produce",
      { transportId: sendTransport.id, kind, rtpParameters },
      (response) => {
        if (response?.error) {
          errback(new Error(response.error));
        } else {
          callback({ id: response.producerId });
        }
      },
    );
  });

  return sendTransport;
}

/**
 * Creates a receive transport and wires the connect signaling event.
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} params - Transport params from the server (id, iceParameters, iceCandidates, dtlsParameters)
 * @returns {Object} The receive transport
 */
export function createRecvTransport(socket, params) {
  recvTransport = device.createRecvTransport(params);
  recvTransportConnected = false;

  recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    if (recvTransportConnected) {
      callback();
      return;
    }
    recvTransportConnected = true;
    socket.emit(
      "transport:connect",
      { transportId: recvTransport.id, dtlsParameters },
      (response) => {
        if (response?.error)
          errback(new Error(response.message || "connect failed"));
        else callback();
      },
    );
  });

  return recvTransport;
}

/**
 * Produces a media track on the send transport.
 * @param {Object} transport - The send transport
 * @param {MediaStreamTrack} track - The media track to produce
 * @returns {Promise<Producer>} The producer
 */
export async function produceTrack(transport, track) {
  return transport.produce({ track });
}

/**
 * Consumes a remote producer track on the receive transport.
 * @param {Object} transport - The receive transport
 * @param {Object} consumerParams - Consumer params from the server (id, producerId, kind, rtpParameters)
 * @returns {Promise<Consumer>} The consumer
 */
export async function consumeTrack(transport, consumerParams) {
  return transport.consume(consumerParams);
}

/**
 * Closes and nulls both send and receive transport references.
 */
export function closeTransports() {
  if (sendTransport) {
    sendTransport.close();
    sendTransport = null;
    sendTransportConnected = false;
  }
  if (recvTransport) {
    recvTransport.close();
    recvTransport = null;
    recvTransportConnected = false;
  }
}

/**
 * Convenience object export so CallRoom.jsx can use `mediasoupClient.xxx()` directly.
 * Also exposes `device` as a getter so rtpCapabilities are accessible.
 */
export const mediasoupClient = {
  get device() {
    return device;
  },

  get recvTransportId() {
    return recvTransport ? recvTransport.id : null;
  },

  /** Alias for loadDevice */
  async initializeDevice(routerRtpCapabilities) {
    return loadDevice(routerRtpCapabilities);
  },

  /** Creates send transport — passes the current socket instance automatically */
  async createSendTransport(params) {
    const { getSocketInstance } = await import("./socket.js");
    return createSendTransport(getSocketInstance(), params);
  },

  /** Creates recv transport — passes the current socket instance automatically */
  async createRecvTransport(params) {
    const { getSocketInstance } = await import("./socket.js");
    return createRecvTransport(getSocketInstance(), params);
  },

  /** Produce a track on the send transport */
  async produceTrack(track, kind) {
    if (!sendTransport) throw new Error("Send transport not initialized");
    return sendTransport.produce({ track });
  },

  /** Consume a remote track on the recv transport */
  async consumeTrack(params) {
    if (!recvTransport) throw new Error("Recv transport not initialized");
    return consumeTrack(recvTransport, params);
  },

  /** Close all transports */
  close() {
    closeTransports();
  },
};
