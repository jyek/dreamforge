"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
export function StatusToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message || typeof document === "undefined") return null;
  return createPortal(
    <div className="df-status-toast" role="status" aria-live="polite">
      <Check size={18} aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>,
    document.body,
  );
}
