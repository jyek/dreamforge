"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DreamForgeBrand } from "./dreamforge-brand";
import { Coins } from "lucide-react";
import { useSidebarState } from "@/lib/use-sidebar-state";
export async function signOut() {
  await fetch("/api/platform/auth", { method: "DELETE" });
  window.location.assign("/login");
}
/** Shared studio navigation: desktop icon rail, mobile drawer, and one
 * persisted collapse preference across dashboard and project routes. */
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
  const { collapsed, toggle: toggleCollapsed } = useSidebarState();
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
      data-collapsed={collapsed}
    >
      <div className="df-sidebar-brand">
        <DreamForgeBrand />
        <button
          className="df-sidebar-collapse"
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <img
            className="df-sidebar-mark-default"
            src="/brand/dreamforge-mark.svg"
            width="30"
            height="30"
            alt=""
            aria-hidden="true"
          />
          <img
            className="df-sidebar-mark-action"
            src="/brand/dreamforge-mark-inverse.svg"
            width="30"
            height="30"
            alt=""
            aria-hidden="true"
          />
        </button>
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
            title={
              balance === null
                ? "Tokens remaining"
                : `${balance.toLocaleString()} tokens remaining`
            }
          >
            <Coins className="df-balance-icon" size={18} aria-hidden="true" />
            <span>Tokens remaining</span>
            <strong>{balance === null ? "—" : balance.toLocaleString()}</strong>
          </Link>
        )}
        <div className="df-sidebar-account">
          {role ? (
            <Link
              href="/profile"
              onClick={onProfileOpen}
              className="df-profile-link"
              aria-label="Open profile"
              title={`${name || "Your account"} · Profile`}
            >
              {account}
            </Link>
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
