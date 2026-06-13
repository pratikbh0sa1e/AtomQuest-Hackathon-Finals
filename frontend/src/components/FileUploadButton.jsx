import React, { useState, useRef } from "react";
import { Button } from "./ui/";

// Inline Paperclip SVG
const PaperclipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.625-13.68l-7.693 7.693a1.5 1.5 0 002.252 2.252l7.693-7.693a.75.75 0 011.06 1.06l-7.693 7.693a3 3 0 11-4.243-4.243l7.693-7.693a4.5 4.5 0 016.364 6.364l-7.693 7.693" />
  </svg>
);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

export default function FileUploadButton({ sessionId, token, onUploadStart, onUploadProgress, onUploadEnd }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Client-side validation: Max 20MB
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File too large — max 20MB");
      return;
    }

    // 2. Client-side validation: MIME type check
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      alert("Only JPEG, PNG, or PDF files are allowed");
      return;
    }

    setUploading(true);
    setProgress(10);
    if (onUploadStart) onUploadStart(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // We will perform a custom fetch request with manual progress monitoring or XHR
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BACKEND_URL}/sessions/${sessionId}/files`, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
          if (onUploadProgress) onUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        setProgress(0);
        
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (onUploadEnd) onUploadEnd(null, response);
        } else {
          let errMsg = "Upload failed";
          if (xhr.status === 413) errMsg = "File too large — max 20MB";
          else if (xhr.status === 415) errMsg = "Only JPEG, PNG, or PDF";
          else if (xhr.status === 422) errMsg = "Session file limit reached (Max 50)";
          
          alert(errMsg);
          if (onUploadEnd) onUploadEnd(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setProgress(0);
        alert("Upload failed due to network error");
        if (onUploadEnd) onUploadEnd(new Error("Network error"));
      };

      xhr.send(formData);

    } catch (err) {
      setUploading(false);
      setProgress(0);
      alert("An unexpected error occurred during upload");
      if (onUploadEnd) onUploadEnd(err);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/jpeg,image/png,application/pdf"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        className="btn-control w-10 h-10 border border-neutral-700 bg-neutral-900 rounded-lg flex items-center justify-center cursor-pointer text-neutral-400 hover:text-white hover:border-[var(--accent)] transition-all min-h-0"
        title="Share image or PDF (Max 20MB)"
      >
        <PaperclipIcon />
      </button>
      
      {uploading && (
        <div className="absolute bottom-12 left-0 w-32 bg-neutral-900 border border-neutral-700 p-2 rounded shadow-md z-20">
          <div className="font-mono text-[9px] text-[var(--accent)] mb-1">UPLOADING: {progress}%</div>
          <div className="w-full bg-neutral-800 h-1.5 rounded overflow-hidden">
            <div 
              className="bg-[var(--accent)] h-full transition-all duration-150" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
