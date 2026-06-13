import React from "react";

const MicOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const VideoOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function VideoTile({ label, isVideoOff, stream, videoRef, isMuted, muted, mediaError, isLocal }) {
  return (
    <div
      className="relative flex-1 min-h-0 overflow-hidden rounded-xl flex items-center justify-center bg-neutral-900"
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Always render the video tag to preserve srcObject, just visually hide it when off */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${isVideoOff || (!stream && !isLocal) ? "hidden" : ""} ${isLocal ? "scale-x-[-1]" : ""}`}
      />

      {/* Overlay Content */}
      {isLocal && mediaError ? (
        // Media error state — local tile only
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-10 text-center px-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 bg-amber-500/10 border border-amber-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-amber-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-mono text-[11px] text-amber-400 font-semibold uppercase tracking-wider mb-1">
            {mediaError === "denied" ? "Camera Blocked" : mediaError === "not-found" ? "No Device" : "HTTPS Required"}
          </p>
          <p className="text-[10px] text-neutral-500 leading-relaxed max-w-[200px] mx-auto">
            {mediaError === "denied"
              ? "Allow camera & mic in browser address bar."
              : mediaError === "not-found"
              ? "Connect a camera and microphone."
              : "Open the https:// URL — accept the security warning once."}
          </p>
        </div>
      ) : !stream && isLocal ? (
        // Connecting spinner
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-10 text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Connecting…</span>
        </div>
      ) : (isVideoOff || (!stream && !isLocal)) ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-10">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-2 text-white font-bold text-2xl shadow-lg"
            style={{ background: isLocal ? "var(--accent)" : "#404040" }}
          >
            {label.charAt(0).toUpperCase()}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            {!stream && !isLocal ? "Waiting to join…" : "Camera Off"}
          </span>
        </div>
      ) : null}

      {/* Name badge — bottom left */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${stream ? "bg-emerald-400" : "bg-neutral-600"}`}
        />
        <span className="text-white text-[11px] font-medium" style={{ fontFamily: '"Playfair Display", serif' }}>
          {label}
        </span>
        {(isMuted || isVideoOff) && stream && (
          <span className="flex items-center gap-0.5 text-[var(--accent)]">
            {isMuted && <MicOffIcon />}
            {isVideoOff && <VideoOffIcon />}
          </span>
        )}
      </div>
    </div>
  );
}

export default function VideoGrid({
  localStream,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  isLocalMuted,
  isLocalVideoOff,
  isRemoteMuted,
  isRemoteVideoOff,
  remoteName,
  mediaError,
}) {
  return (
    /*
     * Mobile:  column flex — each tile is flex-1, so they split the height 50/50
     * Desktop: row flex — side by side
     * The parent div in CallRoom must have an explicit height for flex-1 to work.
     */
    <div className="flex flex-col md:flex-row gap-2 p-2 md:gap-4 md:p-4 w-full h-full bg-[#161616]">
      <VideoTile
        label="You"
        isLocal
        stream={localStream}
        videoRef={localVideoRef}
        isVideoOff={isLocalVideoOff}
        isMuted={isLocalMuted}
        muted
        mediaError={mediaError}
      />
      <VideoTile
        label={remoteName || "Customer"}
        isLocal={false}
        stream={remoteStream}
        videoRef={remoteVideoRef}
        isVideoOff={isRemoteVideoOff}
        isMuted={isRemoteMuted}
        muted={false}
        mediaError={null}
      />
    </div>
  );
}
