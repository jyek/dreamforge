"use client";
import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
export function JoinClassDialog({
  onJoined,
}: {
  onJoined: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [classNumber, setClassNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: classNumber.trim() }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.error || "Could not join this class. Please try again.",
        );
      await onJoined();
      setOpen(false);
      setClassNumber("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
          if (!value) setClassNumber("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="df-button" type="button">
          Join Class
        </button>
      </DialogTrigger>
      <DialogContent
        className="df-card df-join-class-dialog"
        style={{ background: "white", color: "#1a0f2e" }}
      >
        <DialogTitle>Join Class</DialogTitle>
        <DialogDescription>
          Ask your teacher for your Class Number, then enter it below.
        </DialogDescription>
        <form className="df-form" onSubmit={join}>
          <label htmlFor="join-class-number">Class Number</label>
          <input
            id="join-class-number"
            className="df-input"
            value={classNumber}
            onChange={(event) => setClassNumber(event.target.value)}
            placeholder="Enter your Class Number"
            required
            maxLength={30}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
          />
          {error && (
            <p className="df-error" role="alert">
              {error}
            </p>
          )}
          <div className="df-inline">
            <button
              type="submit"
              className="df-button"
              disabled={busy || !classNumber.trim()}
            >
              {busy ? "Joining…" : "Join Class"}
            </button>
            <button
              type="button"
              className="df-button secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setClassNumber("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
