"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UsersIcon } from "lucide-react";
import type { ProjectItem } from "@/lib/project-types";
type Person = { id: string; display_name: string; username: string };
type Group = {
  visible: boolean;
  you: string;
  ownerId: string;
  ownerName: string;
  editorId: string;
  members: Person[];
  candidates: Person[];
  canManage: boolean;
  canPass: boolean;
};
/** Who is in a project's group and who holds the pen. Everyone in the group can
 * view the project; only the student holding the pen can edit it. */
export function GroupDialog({ project }: { project: ProjectItem }) {
  const endpoint = `/api/projects/${project.id}/group`;
  const [group, setGroup] = useState<Group | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pick, setPick] = useState("");
  useEffect(() => {
    let stopped = false;
    void fetch(endpoint, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !stopped && d && setGroup(d))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [endpoint]);
  async function act(body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setGroup(d);
      setPick("");
      // The editor changed, so reload to switch between editing and viewing.
      if ((body as { action?: string }).action !== "add") location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  if (!group?.visible) return null;
  const everyone: Person[] = [
    { id: group.ownerId, display_name: group.ownerName, username: "" },
    ...group.members,
  ];
  const nameOf = (id: string) =>
    everyone.find((p) => p.id === id)?.display_name || "Someone";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium">
          <UsersIcon className="size-3" />
          Group
          {group.members.length ? ` (${group.members.length + 1})` : ""}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group project</DialogTitle>
          <DialogDescription>
            Everyone in the group can look at this project. Only one student can
            change it at a time: {nameOf(group.editorId)}
            {group.editorId === group.you ? " (you)" : ""} is editing now.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {everyone.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="flex-1">
                {p.display_name}
                {p.id === group.ownerId ? " · owner" : ""}
                {p.id === group.editorId ? " · editing" : ""}
              </span>
              {group.canPass && p.id !== group.editorId && (
                <button
                  className="rounded-md border px-2 py-1 text-xs"
                  disabled={busy}
                  onClick={() => void act({ action: "editor", editorId: p.id })}
                >
                  Let {p.display_name.split(" ")[0]} edit
                </button>
              )}
              {(group.canManage || p.id === group.you) &&
                p.id !== group.ownerId && (
                  <button
                    className="rounded-md border px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() =>
                      void act({ action: "remove", childId: p.id })
                    }
                  >
                    {p.id === group.you ? "Leave" : "Remove"}
                  </button>
                )}
            </li>
          ))}
        </ul>
        {group.canManage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pick) void act({ action: "add", childId: pick });
            }}
          >
            <select
              className="flex-1 rounded-md border px-2 py-1.5 text-sm"
              aria-label="Add a classmate"
              value={pick}
              disabled={busy}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">
                {group.candidates.length
                  ? "Add a classmate…"
                  : "No classmates to add"}
              </option>
              {group.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
            <button
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
              disabled={busy || !pick}
            >
              Add
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
