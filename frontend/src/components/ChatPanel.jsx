import React, { useState, useEffect, useRef } from "react";
import { Button, Input, SectionLabel, Card } from "./ui/";
import FileUploadButton from "./FileUploadButton";

// Inline Send SVG
const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

// Inline Paperclip SVG for file downloads
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

export default function ChatPanel({
  messages,
  sessionId,
  token,
  userRole,
  onSendMessage,
  onFileShared
}) {
  const [content, setContent] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll on new message — delay to allow mobile drawer animation
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 300);
    return () => clearTimeout(timer);
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (content.length > 10000) {
      alert("Message size exceeds the maximum limit of 10,000 characters.");
      return;
    }

    onSendMessage(content.trim(), (err) => {
      if (err) {
        alert("Failed to send message: " + err.message);
      } else {
        setContent("");
      }
    });
  };

  const handleUploadEnd = (err, fileData) => {
    if (err) return; // error alert already handled in file upload button
    if (onFileShared) {
      onFileShared(fileData);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--card)] border-l border-[var(--border)] w-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <SectionLabel>In-Call Chat</SectionLabel>
      </div>

      {/* Messages Area */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar" style={{ overscrollBehavior: "contain" }}>
        {messages.map((msg, index) => {
          if (msg.role === "system") {
            return (
              <div key={msg.id || index} className="text-center my-2">
                <span 
                  className="inline-block bg-[var(--muted)] text-[var(--muted-foreground)] font-mono text-[9px] px-2 py-0.5 rounded border border-[var(--border)]"
                  style={{ letterSpacing: "0.05em" }}
                >
                  {msg.text}
                </span>
              </div>
            );
          }

          const isSelf = msg.role === userRole;

          return (
            <div 
              key={msg.id || index} 
              className={`flex flex-col max-w-[85%] border-b border-[var(--border)] pb-2 ${isSelf ? "ml-auto items-end" : "mr-auto items-start"}`}
              style={{ borderColor: "rgba(232, 228, 223, 0.3)" }}
            >
              {/* Sender name in IBM Plex Mono tracked gold */}
              <span 
                className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] mb-1"
                style={{ color: "var(--accent)" }}
              >
                {msg.sender}
              </span>

              {/* Message Content */}
              <div className="text-sm text-[var(--foreground)] break-words w-full">
                {msg.text}

                {/* Render shared files as a neat card */}
                {msg.file && (
                  <Card accentTop className="p-3 mt-2 flex flex-col gap-2 bg-[var(--muted)] border-neutral-200">
                    <div className="flex items-center justify-between gap-4">
                      <div className="overflow-hidden">
                        <div className="font-mono text-xs font-semibold truncate text-[var(--foreground)]">
                          {msg.file.file_name || msg.file.name}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)] font-mono">
                          {msg.file.mime_type || msg.file.type} • {msg.file.file_size || msg.file.size}
                        </div>
                      </div>
                      <a 
                        href={msg.file.file_url || msg.file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-full border border-[var(--border)] bg-white text-[var(--accent)] flex items-center justify-center hover:bg-[var(--muted)] transition-all shrink-0"
                        title="Download file"
                      >
                        <DownloadIcon />
                      </a>
                    </div>
                  </Card>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-[9px] text-[var(--muted-foreground)] mt-1">
                {msg.time || new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Footer */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--muted)] shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center shrink-0">
          
          <FileUploadButton
            sessionId={sessionId}
            token={token}
            onUploadEnd={handleUploadEnd}
          />

          <Input
            type="text"
            placeholder="Type a message..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-grow h-10 px-3 bg-white text-sm"
          />

          <Button 
            type="submit" 
            variant="primary" 
            className="w-10 h-10 p-0 shrink-0 min-h-0 flex items-center justify-center rounded-lg text-white"
          >
            <SendIcon />
          </Button>
        </form>
        <p className="text-[9px] text-[var(--muted-foreground)] mt-1.5 text-left font-mono">
          MAX SIZE 10K CHARACTERS • PDF, JPEG, PNG ONLY
        </p>
      </div>
    </div>
  );
}
