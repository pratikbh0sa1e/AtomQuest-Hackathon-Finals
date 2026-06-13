import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Global toast manager.
 * To show a toast from anywhere:
 * import { showToast } from "../components/ui/Toast";
 * showToast("Login successful!", "success");
 */
let toastCallback = null;

export const showToast = (message, type = "success") => {
  if (toastCallback) toastCallback({ message, type });
};

export function ToastContainer() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    toastCallback = (t) => {
      setToast(null); // Reset to trigger animation if called consecutively
      setTimeout(() => setToast(t), 10);
    };
    return () => {
      toastCallback = null;
    };
  }, []);

  if (!toast) return null;

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  );
}

export function Toast({ message, type = "success", duration = 3000, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enterTimer = setTimeout(() => setVisible(true), 10);
    const exitTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [duration, onClose]);

  if (!message) return null;

  return createPortal(
    <div
      className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-2xl border flex items-center gap-3 transition-all duration-300 transform ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
      }}
    >
      {type === "success" && (
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </span>
      )}
      <span
        className="text-sm font-medium"
        style={{ fontFamily: '"Source Sans 3", system-ui, sans-serif' }}
      >
        {message}
      </span>
    </div>,
    document.body
  );
}
