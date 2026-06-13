import React from "react";
import { Button } from "./ui/";

// Inline SVGs for ControlBar buttons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
  </svg>
);

const MicOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const VideoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);

const VideoOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M12 18.75H4.5A2.25 2.25 0 0 1 2.25 16.5v-9a2.25 2.25 0 0 1 2.25-2.25h.75m10.5 13.5h-1.5m1.5-13.5a2.25 2.25 0 0 1 2.25 2.25v2.25m-15 0H3m18 0h-2.25m-11.25 0h7.5M3 3l18 18" />
  </svg>
);

const RecordIcon = ({ active }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${active ? "text-red-600 animate-pulse" : ""}`}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" />
    <circle cx="12" cy="12" r="5" fill={active ? "red" : "none"} stroke={active ? "red" : "currentColor"} />
  </svg>
);

export default function ControlBar({
  isMuted,
  isVideoOff,
  isRecording,
  recordingStatus, // 'none' | 'recording' | 'processing' | 'ready' | 'failed'
  onToggleMute,
  onToggleVideo,
  onToggleRecording,
  onLeave,
  onEndSession,
  userRole
}) {
  const isAgent = userRole === "agent";

  return (
    <div 
      className="flex justify-between items-center px-6 py-4 bg-[#121212] border-t border-[var(--border)] z-10 w-full"
      style={{ borderColor: "rgba(232, 228, 223, 0.15)" }}
    >
      {/* Left section: Recording status for agent */}
      <div className="flex items-center min-w-[120px]">
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
          className="w-12 h-12 rounded-full border border-neutral-700 bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 hover:border-[var(--accent)] transition-all cursor-pointer touch-manipulation"
          style={{ minHeight: "44px" }}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>

        {/* Video Toggle Button */}
        <button
          onClick={onToggleVideo}
          className="w-12 h-12 rounded-full border border-neutral-700 bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 hover:border-[var(--accent)] transition-all cursor-pointer touch-manipulation"
          style={{ minHeight: "44px" }}
          title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
        >
          {isVideoOff ? <VideoOffIcon /> : <VideoIcon />}
        </button>

        {/* Start/Stop Recording (Agent Only) */}
        {isAgent && (
          <button
            onClick={onToggleRecording}
            className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer touch-manipulation ${
              isRecording 
                ? "bg-red-50 border-red-500 text-red-600" 
                : "bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:border-[var(--accent)]"
            }`}
            style={{ minHeight: "44px" }}
            title={isRecording ? "Stop Recording" : "Start Recording"}
            disabled={recordingStatus === "processing"}
          >
            <RecordIcon active={isRecording} />
          </button>
        )}
      </div>

      {/* Right section: Disconnect/End actions */}
      <div className="flex gap-2 min-w-[120px] justify-end">
        {isAgent ? (
          <Button
            onClick={onEndSession}
            variant="ghost"
            className="text-red-500 bg-red-500/10 border border-red-500/30 hover:bg-red-500 hover:text-white"
            style={{ minHeight: "44px" }}
          >
            End Session
          </Button>
        ) : (
          <Button
            onClick={onLeave}
            variant="secondary"
            className="border-neutral-700 text-neutral-300 hover:bg-neutral-900 hover:text-white"
            style={{ minHeight: "44px" }}
          >
            Leave
          </Button>
        )}
      </div>
    </div>
  );
}
