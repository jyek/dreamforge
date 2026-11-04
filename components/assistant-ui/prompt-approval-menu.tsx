"use client";
import { useCallback, useState } from "react";
import { ActionBarMorePrimitive } from "@assistant-ui/react";
import { EllipsisVertical } from "lucide-react";
import { StatusToast } from "../status-toast";
export type PromptApproval = {
  id: string;
  status: "pending" | "approved" | "denied" | null;
  can_request: boolean;
  eligible: boolean;
  used: boolean;
};
export function PromptApprovalMenu({
  approval,
  onRequest,
}: {
  approval: PromptApproval;
  onRequest: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const dismiss = useCallback(() => setNotice(""), []);
  if (!approval.eligible || (!approval.can_request && !approval.status))
    return null;
  return (
    <>
      <ActionBarMorePrimitive.Root open={open} onOpenChange={setOpen}>
        <ActionBarMorePrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Prompt actions"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <EllipsisVertical className="size-4" />
          </button>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
        align="end"
          className="z-50 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarMorePrimitive.Item
            disabled={busy || !approval.can_request}
            className="rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none hover:bg-accent focus:bg-accent data-disabled:opacity-60"
            onSelect={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await onRequest(approval.id);
                setOpen(false);
                setNotice(
                  "Approval requested. Your teacher can now review this prompt.",
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not request approval.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Requesting…"
              : approval.status === "pending"
                ? "Awaiting teacher approval"
                : approval.status === "approved"
                  ? "Approved by teacher"
                  : approval.status === "denied"
                    ? "Declined by teacher"
                    : "Ask for approval"}
          </ActionBarMorePrimitive.Item>
          {error && (
            <p
              role="alert"
              className="max-w-64 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <StatusToast message={notice} onDismiss={dismiss} />
    </>
  );
}
