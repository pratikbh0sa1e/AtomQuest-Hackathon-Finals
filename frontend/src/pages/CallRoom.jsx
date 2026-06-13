import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket, connectSocket, disconnectSocket } from "../socket";
import { mediasoupClient } from "../mediasoup-client";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";

// Utility to decode JWT token
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
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

  // States
  const [token, setToken] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");
  const [remoteName, setRemoteName] = useState("Waiting...");
  
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

  // Local producers references
  const localAudioProducer = useRef(null);
  const localVideoProducer = useRef(null);

  // Resolve authorization and roles on load
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

    setToken(activeToken);
    setUserRole(payload.role);
    setUserName(payload.name || (payload.role === "agent" ? "Support Agent" : "Customer"));

    // Connect Socket.IO
    connectSocket(activeToken, payload.role, payload.name);

    return () => {
      // Clean up on component unmount
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      mediasoupClient.close();
      disconnectSocket();
    };
  }, [navigate]);

  // Set up socket event listeners after socket connects
  useEffect(() => {
    if (!token) return;

    // Join room
    socket.emit("session:join", { sessionId });

    socket.on("session:joined", async ({ routerRtpCapabilities, participants, messages: chatHistory }) => {
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
          }))
        );
      }

      // Display other participants joining
      const other = participants.find((p) => p.role !== userRole);
      if (other) {
        setRemoteName(other.name);
      }

      // Add system message
      addSystemMessage("Connected to secure SFU media server.");

      // Setup WebRTC media devices
      try {
        await mediasoupClient.initializeDevice(routerRtpCapabilities);
        await setupLocalTransports();
      } catch (err) {
        console.error("WebRTC hardware check or loading failed:", err);
        addSystemMessage("Error connecting media. Please check camera permissions.");
      }
    });

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
      setTimeout(() => {
        navigate(userRole === "agent" ? "/dashboard" : "/");
      }, 3000);
    });

    socket.on("disconnect", () => {
      console.warn("Signaling socket disconnected. Activating silent reconnect...");
      setIsReconnecting(true);
      setReconnectCountdown(30);
    });

    socket.on("reconnect_failed", () => {
      addSystemMessage("Unable to restore connection. Leaving call room.");
      navigate(userRole === "agent" ? "/dashboard" : "/");
    });

    return () => {
      socket.off("session:joined");
      socket.off("new-producer");
      socket.off("peer-media-state");
      socket.off("chat:message");
      socket.off("file-shared");
      socket.off("session-terminated");
      socket.off("disconnect");
    };
  }, [token, sessionId, userRole]);

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
      navigate(userRole === "agent" ? "/dashboard" : "/");
    }
    return () => clearInterval(timer);
  }, [isReconnecting, reconnectCountdown, navigate, userRole]);

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
   * Request transport parameters from backend and initialize client WebRTC transports
   */
  const setupLocalTransports = async () => {
    // 1. Create Send Transport parameters on server
    socket.emit("transport:create", { direction: "send" }, async ({ params, error }) => {
      if (error) {
        console.error("Failed to create send transport params:", error);
        return;
      }

      const sendTransport = await mediasoupClient.createSendTransport(params);
      
      // Get local camera stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 640, height: 360, frameRate: 24 }
        });
        
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Produce tracks
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) {
          localAudioProducer.current = await mediasoupClient.produceTrack(audioTrack, "audio");
        }
        if (videoTrack) {
          localVideoProducer.current = await mediasoupClient.produceTrack(videoTrack, "video");
        }

      } catch (err) {
        console.error("Camera hardware not available or denied:", err);
        addSystemMessage("Microphone/Camera check failed. Ensure hardware is plugged in.");
      }
    });

    // 2. Create Receive Transport parameters on server
    socket.emit("transport:create", { direction: "recv" }, async ({ params, error }) => {
      if (error) {
        console.error("Failed to create recv transport params:", error);
        return;
      }
      await mediasoupClient.createRecvTransport(params);
    });
  };

  /**
   * Consume a remote media track
   */
  const consumeRemoteTrack = (producerId, kind) => {
    socket.emit(
      "transport:consume",
      {
        rtpCapabilities: mediasoupClient.device.rtpCapabilities,
        producerId,
      },
      async ({ params, error }) => {
        if (error) {
          console.error("Failed to consume remote track:", error);
          return;
        }

        const consumer = await mediasoupClient.consumeTrack(params);
        const stream = new MediaStream([consumer.track]);
        
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      }
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

  const handleToggleVideo = () => {
    const newState = !isVideoOff;
    setIsVideoOff(newState);
    if (localVideoProducer.current) {
      if (newState) {
        localVideoProducer.current.pause();
      } else {
        localVideoProducer.current.resume();
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
        cb(null);
      }
    });
  };

  const handleLeaveCall = () => {
    navigate(userRole === "agent" ? "/dashboard" : "/");
  };

  const handleEndSession = () => {
    socket.emit("session:end", { sessionId });
    navigate("/dashboard");
  };

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-73px)] w-full overflow-hidden bg-[#1A1A1A] text-white">
      {/* Network Drop Notification (Requirement 7) */}
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

      {/* Top Session Status Info Bar */}
      <div className="bg-[#121212] px-6 py-2.5 flex justify-between items-center text-xs font-mono border-b border-neutral-900">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>CALL SESSION: {sessionId}</span>
        </div>
        <div className="flex items-center gap-4 text-neutral-400">
          <span>DURATION: {formatDuration(callDuration)}</span>
          {isRecording && (
            <span className="text-red-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              RECORDING
            </span>
          )}
        </div>
      </div>

      {/* Middle Workspace: Video + Chat split-pane */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden w-full">
        {/* Left Side: Video elements */}
        <div className="flex-grow flex flex-col min-h-0 bg-[#151515]">
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
          />
        </div>

        {/* Right Side: Chat Panel */}
        <div className="w-full md:w-[360px] h-full flex shrink-0">
          <ChatPanel
            messages={messages}
            sessionId={sessionId}
            token={token}
            userRole={userRole}
            onSendMessage={handleSendMessage}
            onFileShared={(file) => {
              addSystemMessage(`Shared file uploaded: ${file.file_name}`);
            }}
          />
        </div>
      </div>

      {/* Controller Buttons bottom bar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isRecording={isRecording}
        recordingStatus={recordingStatus}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onToggleRecording={handleToggleRecording}
        onLeave={handleLeaveCall}
        onEndSession={handleEndSession}
        userRole={userRole}
      />
    </div>
  );
}
