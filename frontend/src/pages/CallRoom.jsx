import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket, connectSocket, disconnectSocket } from "../socket";
import { mediasoupClient } from "../mediasoup-client";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";
import { ConfirmDialog } from "../components/ui/";

// Utility to decode JWT token
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default function CallRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Stream references
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // UI state — used for rendering only, NOT as effect dependencies
  const [token, setToken] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [remoteName, setRemoteName] = useState("Waiting...");
  const [mediaError, setMediaError] = useState(null); // 'denied' | 'not-found' | 'not-supported' | 'generic'

  // Refs for values needed inside callbacks without triggering re-renders
  const userRoleRef = useRef("");
  const userNameRef = useRef("");
  const tokenRef = useRef("");

  // Guard: emit session:join only once per mount
  const hasJoinedRef = useRef(false);

  // Call status
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("none");
  const [callDuration, setCallDuration] = useState(0);

  // Reconnect
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(30);

  // Chat/Messages
  const [messages, setMessages] = useState([]);
  // Confirmation dialogs
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Local producers references
  const localAudioProducer = useRef(null);
  const localVideoProducer = useRef(null);

  // Send transport reference (needed for camera toggle)
  const sendTransportRef = useRef(null);

  // Ref to always hold latest stream for cleanup (avoids stale closure in unmount)
  const localStreamRef = useRef(null);

  // Assign stream to video elements when they become available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Replace history entry so back button goes to dashboard, not back into call
  useEffect(() => {
    window.history.replaceState(null, "", window.location.href);
  }, []);

  // Single initialization effect — runs once on mount.
  // Reads token directly from storage so state setters don't re-trigger this effect.
  useEffect(() => {
    const agentToken = localStorage.getItem("agent_token");
    const customerToken = sessionStorage.getItem("customer_token");
    const activeToken = agentToken || customerToken;

    if (!activeToken) {
      console.warn("No authentication token found, redirecting...");
      navigate("/login");
      return;
    }

    const payload = parseJwt(activeToken);
    if (!payload || (payload.role !== "agent" && payload.role !== "customer")) {
      console.warn("Invalid JWT role, redirecting...");
      navigate("/login");
      return;
    }

    const resolvedRole = payload.role;
    const resolvedName =
      payload.name || (resolvedRole === "agent" ? "Support Agent" : "Customer");

    // Store in refs for use inside callbacks (no re-render side-effects)
    tokenRef.current = activeToken;
    userRoleRef.current = resolvedRole;
    userNameRef.current = resolvedName;

    // Also set state so JSX (ChatPanel, ControlBar, etc.) can read them
    setToken(activeToken);
    setUserRole(resolvedRole);
    setUserName(resolvedName);

    // Connect Socket.IO
    connectSocket(activeToken, resolvedRole, resolvedName);

    // ----------------------------------------------------------------
    // Socket event listeners — registered once, use refs for role/name
    // ----------------------------------------------------------------

    // Join room exactly once
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.emit("session:join", { sessionId });
    }

    socket.on(
      "session:joined",
      async ({
        routerRtpCapabilities,
        participants,
        messages: chatHistory,
        existingProducers,
      }) => {
        console.log("Joined session successfully. Loading mediasoup Device...");

        // Load initial chat history
        if (chatHistory) {
          setMessages(
            chatHistory.map((m) => ({
              id: m.id,
              sender: m.sender_name,
              role: m.sender_role,
              text: m.content,
              created_at: m.created_at,
            })),
          );
        }

        // Display other participants
        const other = participants?.find((p) => p.role !== userRoleRef.current);
        if (other) {
          setRemoteName(other.name);
        }

        addSystemMessage("Connected to secure SFU media server.");

        // Setup WebRTC media devices
        try {
          await mediasoupClient.initializeDevice(routerRtpCapabilities);
          await setupLocalTransports();

          // Consume producers that already exist (peer joined before us)
          if (existingProducers && existingProducers.length > 0) {
            for (const { producerId, kind } of existingProducers) {
              console.log(
                `Consuming existing producer: ${producerId} (${kind})`,
              );
              consumeRemoteTrack(producerId, kind);
            }
          }
        } catch (err) {
          console.error("WebRTC hardware check or loading failed:", err);
          setMediaError("not-supported");
          addSystemMessage(
            "Error connecting media. Please check camera permissions.",
          );
        }
      },
    );

    socket.on("new-producer", async ({ producerId, kind }) => {
      console.log(`New remote producer discovered: ${producerId} (${kind})`);
      consumeRemoteTrack(producerId, kind);
    });

    socket.on("peer-media-state", ({ role, kind, enabled }) => {
      if (kind === "audio") {
        setIsRemoteMuted(!enabled);
      } else if (kind === "video") {
        setIsRemoteVideoOff(!enabled);
      }
    });

    socket.on("chat:message", (msg) => {
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id,
          sender: msg.sender_name,
          role: msg.sender_role,
          text: msg.content,
          created_at: msg.created_at,
          file: msg.file,
        },
      ]);
    });

    socket.on("file-shared", (file) => {
      setMessages((prev) => [
        ...prev,
        {
          id: file.id,
          sender: file.sender_name,
          role: file.sender_role,
          text: `Shared a file: ${file.file_name}`,
          file,
          created_at: file.created_at,
        },
      ]);
    });

    socket.on("session-terminated", () => {
      addSystemMessage("This call session has been closed by the agent.");
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      try {
        mediasoupClient.close();
      } catch (_) {}
      setTimeout(() => {
        disconnectSocket();
        const dest = userRoleRef.current === "agent" ? "/dashboard" : "/";
        window.location.href = dest;
      }, 2000);
    });

    socket.on("disconnect", (reason) => {
      // Intentional disconnect (we called disconnectSocket()) — don't trigger reconnect UI
      if (reason === "io client disconnect" || reason === "transport close") {
        return;
      }
      console.warn("Signaling socket disconnected unexpectedly:", reason);
      setIsReconnecting(true);
      setReconnectCountdown(30);
    });

    socket.on("reconnect_failed", () => {
      addSystemMessage("Unable to restore connection. Leaving call room.");
      navigate(userRoleRef.current === "agent" ? "/dashboard" : "/");
    });

    // Cleanup on unmount — uses refs so tracks/socket are always current
    return () => {
      socket.off("session:joined");
      socket.off("new-producer");
      socket.off("peer-media-state");
      socket.off("chat:message");
      socket.off("file-shared");
      socket.off("session-terminated");
      socket.off("disconnect");
      socket.off("reconnect_failed");

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      try {
        mediasoupClient.close();
      } catch (_) {}
      disconnectSocket();
    };
  }, [sessionId, navigate]);

  // Handle reconnect countdown timer
  useEffect(() => {
    let timer;
    if (isReconnecting && reconnectCountdown > 0) {
      timer = setInterval(() => {
        setReconnectCountdown((prev) => prev - 1);
      }, 1000);
    } else if (isReconnecting && reconnectCountdown === 0) {
      setIsReconnecting(false);
      addSystemMessage("Reconnect grace window expired.");
      navigate(userRoleRef.current === "agent" ? "/dashboard" : "/");
    }
    return () => clearInterval(timer);
  }, [isReconnecting, reconnectCountdown, navigate]);

  // Track call duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const addSystemMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: "System",
        role: "system",
        text,
        created_at: new Date().toISOString(),
      },
    ]);
  };

  /**
   * Request transport parameters from backend and initialize client WebRTC transports.
   * Camera/mic permission is requested FIRST before any socket work.
   */
  const setupLocalTransports = async () => {
    // 1. Request camera + mic permission first — before any socket work
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 360, frameRate: 24 },
      });
      // Store in both state (for UI) and ref (for reliable cleanup on unmount)
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera/mic access failed:", err.name, err.message);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setMediaError("denied");
        addSystemMessage(
          "Camera/microphone permission denied. Please allow access and rejoin.",
        );
      } else if (
        err.name === "NotFoundError" ||
        err.name === "DevicesNotFoundError"
      ) {
        setMediaError("not-found");
        addSystemMessage(
          "No camera or microphone found. Please connect a device.",
        );
      } else {
        setMediaError("generic");
        addSystemMessage(`Media error: ${err.message || err.name}`);
      }
      // Continue without media — recv transport still needed to see the other side
    }

    // 2. Create Send + Recv transports in parallel
    const [sendParams, recvParams] = await Promise.all([
      new Promise((resolve) => {
        socket.emit("transport:create", { direction: "send" }, (res) =>
          resolve(res),
        );
      }),
      new Promise((resolve) => {
        socket.emit("transport:create", { direction: "recv" }, (res) =>
          resolve(res),
        );
      }),
    ]);

    if (sendParams?.error) {
      console.error("Failed to create send transport:", sendParams.error);
    } else {
      const sendTransport = await mediasoupClient.createSendTransport(
        sendParams.params,
      );

      // Store in ref for later use (camera toggle)
      sendTransportRef.current = sendTransport;

      // Produce audio FIRST, await fully, then video (SDP m-line ordering requirement)
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) {
          try {
            localAudioProducer.current = await sendTransport.produce({
              track: audioTrack,
            });
            console.log(
              "Audio producer created:",
              localAudioProducer.current.id,
            );
          } catch (e) {
            console.error("Failed to produce audio:", e?.message || e);
          }
        }
        // MUST await audio fully before starting video (mediasoup SDP ordering)
        if (videoTrack) {
          try {
            localVideoProducer.current = await sendTransport.produce({
              track: videoTrack,
            });
            console.log(
              "Video producer created:",
              localVideoProducer.current.id,
            );
          } catch (e) {
            console.error("Failed to produce video:", e?.message || e);
          }
        }
      }
    }

    if (recvParams?.error) {
      console.error("Failed to create recv transport:", recvParams.error);
    } else {
      await mediasoupClient.createRecvTransport(recvParams.params);
    }
  };

  /**
   * Consume a remote media track — retries up to 10x if device/transport not yet ready
   */
  const consumeRemoteTrack = (producerId, kind, retryCount = 0) => {
    // Wait for device and recv transport to be initialized
    if (!mediasoupClient.device || !mediasoupClient.device.rtpCapabilities) {
      if (retryCount < 10) {
        setTimeout(
          () => consumeRemoteTrack(producerId, kind, retryCount + 1),
          500,
        );
      } else {
        console.error(
          "Device not ready after retries, cannot consume:",
          producerId,
        );
      }
      return;
    }

    // Get the recv transport ID from the mediasoup client
    const recvTransportId = mediasoupClient.recvTransportId;
    if (!recvTransportId) {
      if (retryCount < 10) {
        setTimeout(
          () => consumeRemoteTrack(producerId, kind, retryCount + 1),
          500,
        );
      } else {
        console.error("Recv transport not ready after retries");
      }
      return;
    }

    socket.emit(
      "transport:consume",
      {
        transportId: recvTransportId,
        rtpCapabilities: mediasoupClient.device.rtpCapabilities,
        producerId,
      },
      async (response) => {
        console.log(
          `[consume] Response for producer ${producerId}:`,
          JSON.stringify(response),
        );

        if (response?.error) {
          console.error(
            `[consume] Failed for producer ${producerId}:`,
            response.message || response.error,
          );
          return;
        }

        // Server sends { error: false, id, producerId, kind, rtpParameters } flat
        const consumerParams = {
          id: response.id,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters,
        };

        console.log(
          `[consume] Consumer params:`,
          JSON.stringify(consumerParams),
        );

        try {
          const consumer = await mediasoupClient.consumeTrack(consumerParams);
          console.log(
            `[consume] Consumer created: ${consumer.id}, track: ${consumer.track.kind}`,
          );

          setRemoteStream((prevStream) => {
            let newStream;
            if (prevStream) {
              newStream = new MediaStream(prevStream.getTracks());
              newStream.addTrack(consumer.track);
            } else {
              newStream = new MediaStream([consumer.track]);
            }
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = newStream;
            }
            console.log(
              `[consume] Remote stream updated with ${newStream.getTracks().length} tracks`,
            );
            return newStream;
          });
        } catch (err) {
          console.error(
            `[consume] Error consuming track for producer ${producerId}:`,
            err.message || err,
          );
          if (retryCount < 5) {
            console.log(
              `[consume] Retry attempt ${retryCount + 1} for producer ${producerId}`,
            );
            setTimeout(
              () => consumeRemoteTrack(producerId, kind, retryCount + 1),
              800,
            );
          }
        }
      },
    );
  };

  const handleToggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    if (localAudioProducer.current) {
      if (newState) {
        localAudioProducer.current.pause();
      } else {
        localAudioProducer.current.resume();
      }
    }
    socket.emit("media:mute", { enabled: !newState });
  };

  const handleToggleVideo = async () => {
    const newState = !isVideoOff;
    setIsVideoOff(newState);

    if (newState) {
      // TURN OFF VIDEO: Pause producer and completely stop the camera track
      if (localVideoProducer.current) {
        localVideoProducer.current.pause();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.stop();
          localStreamRef.current.removeTrack(track);
        });
      }
      // Update local video UI
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    } else {
      // TURN ON VIDEO: Request a new camera stream and replace the track
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360, frameRate: 24 },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];

        if (localStreamRef.current) {
          localStreamRef.current.addTrack(newVideoTrack);
        } else {
          localStreamRef.current = newStream;
          setLocalStream(newStream);
        }

        // Re-attach to local UI
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        // Replace the track in the existing producer
        if (localVideoProducer.current) {
          await localVideoProducer.current.replaceTrack({
            track: newVideoTrack,
          });
          localVideoProducer.current.resume();
        } else if (sendTransportRef.current) {
          // If producer doesn't exist, create a new one
          localVideoProducer.current = await sendTransportRef.current.produce({
            track: newVideoTrack,
          });
          console.log(
            "New video producer created:",
            localVideoProducer.current.id,
          );
        }
      } catch (err) {
        console.error("Failed to restart video:", err);
        addSystemMessage("Failed to restart camera.");
        setIsVideoOff(true); // Revert UI
      }
    }

    socket.emit("media:camera", { enabled: !newState });
  };

  const handleToggleRecording = () => {
    if (!isRecording) {
      setRecordingStatus("recording");
      socket.emit("recording:start", { sessionId });
      setIsRecording(true);
      addSystemMessage("Recording started by agent.");
    } else {
      setRecordingStatus("processing");
      socket.emit("recording:stop", { sessionId });
      setIsRecording(false);
      addSystemMessage("Recording stopped. Archiving stream...");

      // Simulate compilation delay
      setTimeout(() => {
        setRecordingStatus("ready");
        addSystemMessage("Recording archived. Ready for download.");
      }, 5000);
    }
  };

  const handleSendMessage = (text, cb) => {
    socket.emit("chat:send", { content: text }, (response) => {
      if (response && response.error) {
        cb(new Error(response.error));
      } else {
        // Append local message since we don't broadcast to ourselves
        setMessages((prev) => [
          ...prev,
          {
            id: response?.message?.id || Date.now(),
            sender: userNameRef.current,
            role: userRoleRef.current,
            text,
            created_at: new Date().toISOString(),
          },
        ]);
        cb(null);
      }
    });
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    try {
      mediasoupClient.close();
    } catch (_) {}
    // Disconnect socket last — after media is stopped
    disconnectSocket();
  };

  const handleLeaveCall = () => {
    cleanup();
    const dest = userRoleRef.current === "agent" ? "/dashboard" : "/";
    window.location.href = dest;
  };

  const handleEndSession = () => {
    try {
      socket.emit("session:end", { sessionId });
    } catch (_) {}
    cleanup();
    window.location.href = "/dashboard";
  };

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-full overflow-hidden bg-[#1A1A1A] text-white">
      {/* Network Drop Notification */}
      {isReconnecting && (
        <div className="absolute inset-x-0 top-20 mx-auto max-w-sm bg-neutral-900 border border-red-500 rounded-lg p-4 z-50 text-center shadow-lg">
          <div className="font-mono text-sm text-red-500 font-bold mb-1">
            NETWORK SIGNAL DROPPED
          </div>
          <p className="text-xs text-neutral-400 mb-2">
            Silent Reconnect active. Rejoining stream room...
          </p>
          <div className="font-mono text-xs text-[var(--accent-secondary)]">
            Timeout: {reconnectCountdown}s
          </div>
        </div>
      )}

      {/* Top Session Status Bar */}
      <div className="bg-[#121212] px-4 py-2 flex justify-between items-center text-xs font-mono border-b border-neutral-900 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="truncate text-neutral-300">
            SESSION: {sessionId?.slice(0, 8)}…
          </span>
        </div>
        <div className="flex items-center gap-3 text-neutral-400 shrink-0 ml-2">
          <span>{formatDuration(callDuration)}</span>
          {isRecording && (
            <span className="text-red-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              REC
            </span>
          )}
        </div>
      </div>

      {/* ── Main workspace ── */}
      {/*
        DESKTOP: side-by-side (video left, chat right sidebar)
        MOBILE:  video fills all space, chat is a bottom drawer overlay
      */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">
        {/* Video area — fills all remaining space; VideoGrid tiles use flex-1 inside */}
        <div className="flex-1 min-h-0 min-w-0 h-full">
          <VideoGrid
            localStream={localStream}
            remoteStream={remoteStream}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            isLocalMuted={isMuted}
            isLocalVideoOff={isVideoOff}
            isRemoteMuted={isRemoteMuted}
            isRemoteVideoOff={isRemoteVideoOff}
            remoteName={remoteName}
            mediaError={mediaError}
          />
        </div>

        {/* Chat panel — sidebar on desktop, bottom drawer on mobile */}
        {/* Desktop sidebar */}
        <div className="hidden md:flex w-[340px] shrink-0 border-l border-neutral-800 flex-col">
          <ChatPanel
            messages={messages}
            sessionId={sessionId}
            token={token}
            userRole={userRole}
            onSendMessage={handleSendMessage}
            onFileShared={(file) =>
              addSystemMessage(`Shared file uploaded: ${file.file_name}`)
            }
          />
        </div>

        {/* Mobile bottom drawer */}
        <div
          className={`md:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl ${
            isChatOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
          }`}
          style={{ height: "65vh", background: "#111" }}
        >
          {/* Drawer handle / close strip */}
          <button
            type="button"
            className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-[#0d0d0d] w-full cursor-pointer text-left focus:outline-none"
            onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setIsChatOpen(false); }}
          >
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
              Close Chat
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 text-neutral-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={messages}
              sessionId={sessionId}
              token={token}
              userRole={userRole}
              onSendMessage={handleSendMessage}
              onFileShared={(file) =>
                addSystemMessage(`Shared file uploaded: ${file.file_name}`)
              }
            />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isRecording={isRecording}
        recordingStatus={recordingStatus}
        isChatOpen={isChatOpen}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onToggleRecording={handleToggleRecording}
        onToggleChat={() => setIsChatOpen((p) => !p)}
        onLeave={() => setShowLeaveConfirm(true)}
        onEndSession={() => setShowEndConfirm(true)}
        userRole={userRole}
      />

      <ConfirmDialog
        open={showLeaveConfirm}
        title="Leave Call"
        message="Are you sure you want to leave this call?"
        confirmText="Leave"
        cancelText="Stay"
        variant="danger"
        onConfirm={handleLeaveCall}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <ConfirmDialog
        open={showEndConfirm}
        title="End Session"
        message="This will terminate the call for all participants. Are you sure?"
        confirmText="End Session"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleEndSession}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  );
}
