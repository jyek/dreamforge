"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { DreamForgeBrand } from "./dreamforge-brand";
export async function signOut() {
  await fetch("/api/platform/auth", { method: "DELETE" });
  window.location.assign("/login");
}
export function StudioSidebar({
  name,
  role,
  caption,
  navigation,
  children,
  toggle,
  className = "",
  label = "Studio sidebar",
}: {
  name?: string;
  role?: "teacher" | "child";
  caption?: string;
  navigation: ReactNode;
  children?: ReactNode;
  toggle?: ReactNode;
  className?: string;
  label?: string;
}) {
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
      <div className="df-sidebar-account">
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
        {role ? (
          <button aria-label="Sign out" title="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </button>
        ) : (
          <Link href="/login" className="df-purple">
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
