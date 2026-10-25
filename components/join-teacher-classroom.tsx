"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function JoinTeacherClassroom({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function join() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/platform/classroom-invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      router.push(`/classrooms/${d.classId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <button className="df-button" disabled={busy} onClick={join}>
        {busy ? "Joining…" : "Join as a co-teacher"}
      </button>
      {error && (
        <p className="df-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
