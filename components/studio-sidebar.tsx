"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DreamForgeBrand } from "./dreamforge-brand";
import { watchBalanceChanges } from "@/lib/balance-refresh";
import { formatCredit } from "@/lib/billing";
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
  creditBalanceMicros,
  onProfileOpen,
  role,
  caption,
  navigation,
  children,
  toggle,
  className = "",
  label = "Studio sidebar",
  hideCollapseControl = false,
}: {
  name?: string;
  remainingTokens?: number;
  creditBalanceMicros?: number;
  onProfileOpen?: () => void;
  role?: "teacher" | "child";
  caption?: string;
  navigation: ReactNode;
  children?: ReactNode;
  toggle?: ReactNode;
  className?: string;
  label?: string;
  hideCollapseControl?: boolean;
}) {
  const { collapsed, toggle: toggleCollapsed } = useSidebarState();
  const [fetchedBalance, setFetchedBalance] = useState<number | null>(null);
  const [fetchedCredit, setFetchedCredit] = useState<number | null>(null);
  useEffect(() => {
    if (
      role !== "child" ||
      remainingTokens !== undefined ||
      creditBalanceMicros !== undefined
    )
      return;
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
            if (data.prepaid) setFetchedCredit(data.availableCreditMicros);
          }
        })
        .catch(() => {});
    const afterRequest = (event: Event) => {
      if (!(event as CustomEvent).detail?.isRunning) void refresh();
    };
    void refresh();
    const unwatch = watchBalanceChanges(refresh);
    window.addEventListener("dreamforge:thread-state", afterRequest);
    return () => {
      controller.abort();
      unwatch();
      window.removeEventListener("dreamforge:thread-state", afterRequest);
    };
  }, [role, remainingTokens, creditBalanceMicros]);
  const balance = remainingTokens ?? fetchedBalance;
  const credit = creditBalanceMicros ?? fetchedCredit;
  const account = (
    <>
      <span className="df-studio-avatar" aria-hidden="true">
        {name?.charAt(0).toUpperCase() || "✦"}
      </span>
      <div className="df-account-details">
        <strong>{name || "DreamForge"}</strong>
        {role === "child" ? (
          <small className="df-account-tokens">
            {credit !== null ? "Credit" : "Tokens"}
            <span>
              {credit !== null
                ? formatCredit(credit)
                : balance === null
                  ? "—"
                  : balance.toLocaleString()}
            </span>
          </small>
        ) : (
          <small>{role === "teacher" ? "Teacher" : "Project explorer"}</small>
        )}
      </div>
    </>
  );
  const sidebarCaption =
    caption || (role === "teacher" ? "TEACHER STUDIO" : "");
  return (
    <aside
      className={`df-studio-sidebar ${sidebarCaption ? "" : "without-caption"} ${className}`}
      aria-label={label}
      data-collapsed={hideCollapseControl ? false : collapsed}
    >
      <div className="df-sidebar-brand">
        {!hideCollapseControl && <DreamForgeBrand />}
        {!hideCollapseControl && (
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
        )}
        {toggle}
      </div>
      {sidebarCaption && <p className="df-sidebar-caption">{sidebarCaption}</p>}
      {navigation}
      {children}
      <div className="df-sidebar-footer">
        <div className="df-sidebar-account">
          {role ? (
            <Link
              href="/profile"
              onClick={onProfileOpen}
              className="df-profile-link"
              aria-label="Open profile"
              title={
                role === "child"
                  ? `${name || "Your account"} · ${credit !== null ? `Credit ${formatCredit(credit)}` : `Tokens ${balance === null ? "—" : balance.toLocaleString()}`} · Profile`
                  : `${name || "Your account"} · Profile`
              }
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
