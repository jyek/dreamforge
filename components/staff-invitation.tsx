"use client";
import { useState, type FormEvent } from "react";
import { ProfileModuleHeader } from "./profile-module-header";
import { CopyButton } from "./copy-button";
import { InlineSpinner } from "./dream-loading";
export function StaffInvitation({
  schoolAdmin,
  schoolName,
}: {
  schoolAdmin: boolean;
  schoolName?: string | null;
}) {
  const [role, setRole] = useState("teacher"),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed = schoolAdmin || !schoolName;
  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    try {
      const response = await fetch(
        schoolAdmin ? "/api/platform/school" : "/api/platform/classes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            schoolAdmin
              ? { admin: role === "school_admin" }
              : { action: "inviteTeacher" },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Could not create an invitation.");
      setLink(data.link);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not create an invitation.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="df-card df-settings-card df-profile-module">
      <ProfileModuleHeader
        eyebrow="INVITATIONS"
        title="Invite a colleague"
        description={
          allowed
            ? "Choose their role and create a private invitation link. Each link works once and expires after seven days."
            : "Ask your school admin to invite a teacher or school admin to your school."
        }
      />
      {allowed && (
        <form className="df-staff-invite-form" onSubmit={invite}>
          <label>
            Role
            <select
              className="df-input"
              aria-label="Invitation role"
              value={role}
              disabled={busy}
              onChange={(e) => {
                setRole(e.target.value);
                setLink("");
                setError("");
              }}
            >
              <option value="teacher">Teacher</option>
              {schoolAdmin && (
                <option value="school_admin">School Admin</option>
              )}
            </select>
          </label>
          <p className="df-muted">
            {role === "school_admin"
              ? "Manages teachers, students, classes and groups across your school."
              : "Teaches assigned classes and reviews students’ work and flagged prompts."}
          </p>
          <button className="df-button secondary" disabled={busy}>
            {busy && <InlineSpinner className="size-4" />}
            {busy ? "Creating invitation…" : "Create invitation link"}
          </button>
        </form>
      )}
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
      {link && (
        <div className="df-notice" role="status">
          <p>
            {role === "school_admin" ? "School Admin" : "Teacher"} invitation
            ready. Share this link privately:
          </p>
          <div className="df-inline">
            <input
              className="df-input"
              aria-label="Staff invitation link"
              readOnly
              value={link}
            />
            <CopyButton value={link} className="df-button secondary small">
              Copy link
            </CopyButton>
          </div>
        </div>
      )}
    </section>
  );
}
