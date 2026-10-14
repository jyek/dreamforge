"use client";
import { useEffect, useState, type ReactNode } from "react";
export function CopyButton({
  value,
  children,
  className = "df-button secondary small",
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    setError(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError(true);
    }
  }
  return (
    <span className="df-copy-wrap">
      <button type="button" className={className} onClick={copy}>
        {children}
      </button>
      {copied && (
        <span className="df-copy-popup" role="status">
          Copied
        </span>
      )}
      {error && (
        <span className="df-copy-popup" role="alert">
          Couldn’t copy. Try again.
        </span>
      )}
    </span>
  );
}
