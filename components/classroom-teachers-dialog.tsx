"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
import { CopyButton } from "./copy-button";
import { SimpleLoading } from "./dream-loading";
import { ClassroomAvatar } from "./classroom-avatar";
type Data = {
  canManage: boolean;
  teachers: { id: string; display_name: string; is_owner: boolean }[];
  invitations: { id: string; expires_at: string }[];
};
export function ClassroomTeachersDialog({
  classId,
  onChanged,
}: {
  classId: string;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState("");
  const endpoint = `/api/platform/classes/${classId}/teachers`;
  async function load() {
    const r = await fetch(endpoint),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
  }
  async function mutate(method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.link) setLink(d.link);
      else setLink("");
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        if (value) {
          setData(null);
          setError("");
          setLink("");
          void load().catch((e) => setError(e.message));
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="df-button secondary">Class teachers</button>
      </DialogTrigger>
      <DialogContent className="df-card df-class-teachers-dialog">
        <DialogTitle>Class teachers</DialogTitle>
        <DialogDescription>
          Co-teachers can review students, projects and safety alerts, and share
          their own teaching projects. Only the owner can manage teachers or
          delete the classroom.
        </DialogDescription>
        {!data && !error && <SimpleLoading inline label="Loading teachers…" />}
        <div className="df-teaching-team-list">
          {data?.teachers.map((t) => (
            <div className="df-teaching-team-person" key={t.id}>
              <ClassroomAvatar identity={t.id} role="teacher" />
              <div>
                <strong>{t.display_name}</strong>
                <small>{t.is_owner ? "Classroom owner" : "Co-teacher"}</small>
              </div>
              {data.canManage && !t.is_owner && (
                <button
                  className="df-button secondary small"
                  disabled={busy}
                  onClick={() => mutate("DELETE", { teacherId: t.id })}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {data?.canManage && (
          <>
            <button
              className="df-button"
              disabled={busy}
              onClick={() => mutate("POST")}
            >
              {busy ? "Working…" : "Invite a co-teacher"}
            </button>
            {link && (
              <div className="df-notice">
                <p>
                  Copy this private link and send it to your co-teacher. It
                  works once and expires in seven days.
                </p>
                <div className="df-inline">
                  <input
                    className="df-input"
                    readOnly
                    aria-label="Co-teacher invitation link"
                    value={link}
                  />
                  <CopyButton
                    value={link}
                    className="df-button secondary small"
                  >
                    Copy link
                  </CopyButton>
                </div>
              </div>
            )}
            {!!data.invitations.length && (
              <div className="df-pending-teacher-invites">
                <h3>Pending invitations</h3>
                {data.invitations.map((invite, index) => (
                  <div className="df-inline" key={invite.id}>
                    <span>
                      Invitation {index + 1} · Expires{" "}
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </span>
                    <button
                      className="df-button secondary small"
                      disabled={busy}
                      onClick={() => mutate("DELETE", { inviteId: invite.id })}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {error && (
          <p className="df-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
