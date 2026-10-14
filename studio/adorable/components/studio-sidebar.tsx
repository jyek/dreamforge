"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import { DreamForgeBrand } from "./dreamforge-brand";
export async function signOut() {
  await fetch("/api/platform/auth", { method: "DELETE" });
  window.location.assign("/login");
}
export function StudioSidebar({
  name,
  remainingTokens,
  onProfileOpen,
  role,
  caption,
  navigation,
  children,
  toggle,
  className = "",
  label = "Studio sidebar",
}: {
  name?: string;
  remainingTokens?: number;
  onProfileOpen?: () => void;
  role?: "teacher" | "child";
  caption?: string;
  navigation: ReactNode;
  children?: ReactNode;
  toggle?: ReactNode;
  className?: string;
  label?: string;
}) {
  const [fetchedBalance, setFetchedBalance] = useState<number | null>(null);
  useEffect(() => {
    if (role !== "child" || remainingTokens !== undefined) return;
    const controller = new AbortController();
    const refresh = () =>
      fetch("/api/platform/balance", {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setFetchedBalance(data.remaining);
          }
        })
        .catch(() => {});
    const afterRequest = (event: Event) => {
      if (!(event as CustomEvent).detail?.isRunning) void refresh();
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("adorable:thread-state", afterRequest);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("adorable:thread-state", afterRequest);
    };
  }, [role, remainingTokens]);
  const balance = remainingTokens ?? fetchedBalance;
  const account = (
    <>
      <span className="df-studio-avatar" aria-hidden="true">
        {name?.charAt(0).toUpperCase() || "✦"}
      </span>
      <div>
        <strong>{name || "DreamForge"}</strong>
        <small>
          {role === "teacher"
            ? "Teacher"
            : role === "child"
              ? "Builder"
              : "Project explorer"}
        </small>
      </div>
    </>
  );
  const sidebarCaption =
    caption || (role === "teacher" ? "TEACHER STUDIO" : "");
  return (
    <aside
      className={`df-studio-sidebar ${sidebarCaption ? "" : "without-caption"} ${className}`}
      aria-label={label}
    >
      <div className="df-sidebar-brand">
        <DreamForgeBrand />
        {toggle}
      </div>
      {sidebarCaption && <p className="df-sidebar-caption">{sidebarCaption}</p>}
      {navigation}
      {children}
      <div className="df-sidebar-footer">
        {role === "child" && (
          <Link
            href="/profile"
            onClick={onProfileOpen}
            className="df-sidebar-balance"
            aria-label="View token balance and profile"
          >
            <span>Tokens remaining</span>
            <strong>{balance === null ? "—" : balance.toLocaleString()}</strong>
          </Link>
        )}
        <div className="df-sidebar-account">
          {role === "child" ? (
            <Link
              href="/profile"
              onClick={onProfileOpen}
              className="df-profile-link"
              aria-label="Open profile"
            >
              {account}
            </Link>
          ) : role === "teacher" ? (
            <details
              className="df-account-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") event.currentTarget.open = false;
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  event.currentTarget.open = false;
              }}
            >
              <summary
                className="df-profile-link"
                aria-label="Teacher profile menu"
              >
                {account}
                <ChevronUp size={16} aria-hidden="true" />
              </summary>
              <div
                className="df-account-menu-content"
                role="menu"
                aria-label="Teacher account"
              >
                <Link role="menuitem" href="/profile" onClick={onProfileOpen}>
                  Manage profile
                </Link>
                <button role="menuitem" onClick={signOut}>
                  Log out
                </button>
              </div>
            </details>
          ) : (
            account
          )}
          {!role && (
            <Link href="/login" className="df-purple">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
