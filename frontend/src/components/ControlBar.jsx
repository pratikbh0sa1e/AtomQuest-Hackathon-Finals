import React from "react";
import { Button } from "./ui/";

// ── Proper SVG Icons ──────────────────────────────────────────────────────────
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
  </svg>
);

const MicOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const VideoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);

const VideoOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RecordIcon = ({ active }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${active ? "text-red-600 animate-pulse" : ""}`}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" />
    <circle cx="12" cy="12" r="5" fill={active ? "red" : "none"} stroke={active ? "red" : "currentColor"} />
  </svg>
);

const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);

export default function ControlBar({
  isMuted,
  isVideoOff,
  isRecording,
  recordingStatus,
  isChatOpen,
  onToggleMute,
  onToggleVideo,
  onToggleRecording,
  onToggleChat,
  onLeave,
  onEndSession,
  userRole
}) {
  const isAgent = userRole === "agent";

  // Handle chat toggle with proper touch support to prevent double-fire
  const handleChatToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleChat();
  };

  return (
    <div 
      className="flex flex-col sm:flex-row justify-between items-center gap-4 px-6 py-3 sm:py-4 bg-[#121212] border-t border-[var(--border)] z-10 w-full"
      style={{ borderColor: "rgba(232, 228, 223, 0.15)" }}
    >
      {/* Left section: Recording status for agent */}
      <div className="flex items-center justify-center sm:justify-start min-w-0 sm:min-w-[120px] h-4 sm:h-auto">
        {isAgent && recordingStatus !== 'none' && (
          <span className="font-mono text-xs text-neutral-400 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${recordingStatus === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
            REC: {recordingStatus.toUpperCase()}
          </span>
        )}
      </div>

      {/* Middle section: Device toggles and recording */}
      <div className="flex items-center gap-4">
        {/* Mute Button */}
        <button
          onClick={onToggleMute}
          className="w-12 h-12 rounded-full border border-neutral-700 bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 hover:border-[var(--accent)] transition-all cursor-pointer"
          style={{ minHeight: "44px", touchAction: "manipulation" }}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>

        {/* Video Toggle Button */}
        <button
          onClick={onToggleVideo}
          className="w-12 h-12 rounded-full border border-neutral-700 bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 hover:border-[var(--accent)] transition-all cursor-pointer"
          style={{ minHeight: "44px", touchAction: "manipulation" }}
          title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
        >
          {isVideoOff ? <VideoOffIcon /> : <VideoIcon />}
        </button>

        {/* Chat Toggle — mobile only */}
        <button
          onPointerUp={handleChatToggle}
          className={`md:hidden w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
            isChatOpen
              ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
              : "bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800"
          }`}
          style={{ minHeight: "44px", touchAction: "manipulation" }}
          title="Toggle Chat"
        >
          <ChatIcon />
        </button>

        {/* Start/Stop Recording (Agent Only) */}
        {isAgent && (
          <button
            onClick={onToggleRecording}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
              isRecording 
                ? "bg-red-50 border-red-500 text-red-600" 
                : "bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:border-[var(--accent)]"
            }`}
            style={{ minHeight: "44px", touchAction: "manipulation" }}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            disabled={recordingStatus === "processing"}
          >
            <RecordIcon active={isRecording} />
          </button>
        )}
      </div>

      {/* Right section: Disconnect/End actions */}
      <div className="flex gap-2 min-w-0 sm:min-w-[120px] justify-center sm:justify-end w-full sm:w-auto">
        {isAgent ? (
          <Button
            onClick={onEndSession}
            variant="ghost"
            className="text-red-500 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:text-white w-full sm:w-auto"
            style={{ minHeight: "44px" }}
          >
            End Session
          </Button>
        ) : (
          <Button
            onClick={onLeave}
            variant="secondary"
            className="border-neutral-700 text-neutral-300 hover:bg-neutral-900 hover:text-white w-full sm:w-auto"
            style={{ minHeight: "44px" }}
          >
            Leave
          </Button>
        )}
      </div>
    </div>
  );
}
