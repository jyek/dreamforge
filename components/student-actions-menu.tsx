"use client";
import { useId, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
export function StudentActionsMenu({
  name,
  canAssign,
  canRemove,
  onAssign,
  onRemove,
  disabled,
}: {
  name: string;
  canAssign: boolean;
  canRemove: boolean;
  onAssign: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  function choose(action: () => void) {
    menu.current?.hidePopover();
    action();
  }
  return (
    <>
      <button
        type="button"
        className="df-student-menu-trigger"
        aria-label={`Manage ${name}`}
        aria-haspopup="menu"
        popoverTarget={id}
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({ top: r.bottom + 6, left: Math.max(8, r.right - 210) });
        }}
      >
        <MoreVertical size={19} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label={`Actions for ${name}`}
        className="df-student-actions-menu"
        style={position}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            items[
              (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length
            ]?.focus();
          }
        }}
      >
        <button
          role="menuitem"
          disabled={!canAssign}
          onClick={() => choose(onAssign)}
        >
          Add to classroom
        </button>
        <button
          role="menuitem"
          disabled={!canRemove}
          onClick={() => choose(onRemove)}
        >
          Remove from classroom
        </button>
      </div>
    </>
  );
}
