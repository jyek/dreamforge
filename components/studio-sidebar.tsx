"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DreamForgeBrand } from "./dreamforge-brand";
import { watchBalanceChanges } from "@/lib/balance-refresh";
import { formatCreditBalance } from "@/lib/billing";
import { useSidebarState } from "@/lib/use-sidebar-state";
export async function signOut() {
  await fetch("/api/platform/auth", { method: "DELETE" });
  window.location.assign("/login");
}
/** Shared studio navigation: desktop icon rail, mobile drawer, and one
 * persisted collapse preference across dashboard and project routes. */
export function StudioSidebar({
  name,
  accountLoading = false,
  accountError = false,
  onRetryAccount,
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
  accountLoading?: boolean;
  accountError?: boolean;
  onRetryAccount?: () => void;
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
  const [fetchedCredit, setFetchedCredit] = useState<number | null>(null);
  useEffect(() => {
    if (role !== "child" || creditBalanceMicros !== undefined) return;
    const controller = new AbortController();
    const refresh = () =>
      fetch("/api/platform/balance", {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          if (r.ok) {
            const data = await r.json();
            setFetchedCredit(
              typeof data.availableCreditMicros === "number" &&
                Number.isFinite(data.availableCreditMicros)
                ? data.availableCreditMicros
                : null,
            );
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
  }, [role, creditBalanceMicros]);
  const credit = creditBalanceMicros ?? fetchedCredit;
  const displayedCredit = credit;
  const creditLabel = "Credits left:";
  const account = (
    <>
      <span className="df-studio-avatar" aria-hidden="true">
        {name?.charAt(0).toUpperCase() || "✦"}
      </span>
      <div className="df-account-details">
        <strong>{name || "DreamForge"}</strong>
        {role === "child" ? (
          displayedCredit !== null && (
            <small className="df-account-tokens">
              {creditLabel}
              <span>{formatCreditBalance(displayedCredit)}</span>
            </small>
          )
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
          {accountLoading ? (
            <div
              role="status"
              aria-label="Loading profile"
              aria-busy="true"
              className="df-sidebar-account-loading"
            >
              <span aria-hidden="true" className="df-account-skeleton-avatar" />
              <span aria-hidden="true" className="df-account-skeleton-lines">
                <span />
                <span />
              </span>
            </div>
          ) : accountError ? (
            <div className="df-account-details" role="status">
              <span>Profile unavailable</span>
              {onRetryAccount && (
                <button
                  type="button"
                  className="df-purple"
                  onClick={onRetryAccount}
                >
                  Try again
                </button>
              )}
            </div>
          ) : (
            <>
              {role ? (
                <Link
                  href="/profile"
                  onClick={onProfileOpen}
                  className="df-profile-link"
                  aria-label="Open profile"
                  title={
                    role === "child"
                      ? `${name || "Your account"}${displayedCredit === null ? "" : ` · ${creditLabel} ${formatCreditBalance(displayedCredit)}`} · Profile`
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
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
