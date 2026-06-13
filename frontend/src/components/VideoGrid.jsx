import React from "react";

// Inline MicOff SVG
const MicOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--accent)]">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

// Inline VideoOff SVG
const VideoOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--accent)]">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5A2.25 2.25 0 0 1 2.25 16.5v-9a2.25 2.25 0 0 1 2.25-2.25h.75m10.5 13.5h-1.5m1.5-13.5a2.25 2.25 0 0 1 2.25 2.25v2.25m-15 0H3m18 0h-2.25m-11.25 0h7.5M3 3l18 18" />
  </svg>
);

export default function VideoGrid({
  localStream,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  isLocalMuted,
  isLocalVideoOff,
  isRemoteMuted,
  isRemoteVideoOff,
  remoteName
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 items-center justify-center bg-[#1A1A1A] flex-grow overflow-auto h-full">
      {/* Local Video Tile */}
      <div 
        className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] shadow-md flex items-center justify-center bg-neutral-900"
        style={{ borderColor: "rgba(232, 228, 223, 0.15)" }}
      >
        {isLocalVideoOff ? (
          <div className="text-center">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 text-white font-semibold text-2xl"
              style={{ background: "var(--accent)" }}
            >
              Y
            </div>
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">Camera Off</span>
          </div>
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform scaleX(-1)"
          />
        )}
        <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded text-white text-xs font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span style={{ fontFamily: '"Playfair Display", serif' }}>You</span>
          {(isLocalMuted || isLocalVideoOff) && (
            <span className="flex gap-1 ml-1 bg-[var(--accent)]/20 px-1.5 py-0.5 rounded text-[10px] text-[var(--accent-secondary)]">
              {isLocalMuted && <MicOffIcon />}
              {isLocalVideoOff && <VideoOffIcon />}
            </span>
          )}
        </div>
      </div>

      {/* Remote Video Tile */}
      <div 
        className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] shadow-md flex items-center justify-center bg-neutral-900"
        style={{ borderColor: "rgba(232, 228, 223, 0.15)" }}
      >
        {isRemoteVideoOff || !remoteStream ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-700 flex items-center justify-center mx-auto mb-2 text-white font-semibold text-2xl">
              {remoteName ? remoteName.charAt(0).toUpperCase() : "?"}
            </div>
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
              {!remoteStream ? "Waiting for join..." : "Camera Off"}
            </span>
          </div>
        ) : (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded text-white text-xs font-medium flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${remoteStream ? "bg-emerald-500" : "bg-neutral-500"}`} />
          <span style={{ fontFamily: '"Playfair Display", serif' }}>
            {remoteName || "Customer"}
          </span>
          {remoteStream && (isRemoteMuted || isRemoteVideoOff) && (
            <span className="flex gap-1 ml-1 bg-[var(--accent)]/20 px-1.5 py-0.5 rounded text-[10px] text-[var(--accent-secondary)]">
              {isRemoteMuted && <MicOffIcon />}
              {isRemoteVideoOff && <VideoOffIcon />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
