import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default", // 'default' | 'danger'
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  // Trap focus & close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", handleKey);
    // Focus the cancel button by default
    setTimeout(() => {
      dialogRef.current?.querySelector("[data-autofocus]")?.focus();
    }, 10);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-xl border shadow-2xl animate-in fade-in zoom-in-95"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
          animation: "dialogIn 0.2s ease-out",
        }}
      >
        <div className="p-6">
          <h3
            id="confirm-title"
            className="text-xl font-semibold mb-2"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "var(--foreground)",
            }}
          >
            {title}
          </h3>
          {message && (
            <p
              id="confirm-message"
              className="text-sm leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              {message}
            </p>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <Button
            data-autofocus
            onClick={onCancel}
            variant="ghost"
            className="flex-1 border"
            style={{ borderColor: "var(--border)" }}
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            variant={isDanger ? "destructive" : "primary"}
            className="flex-1"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
