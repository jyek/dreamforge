"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
export function NoClassroomProjects() {
  const [open, setOpen] = useState(false);
  return (
    <span className="df-no-classroom-projects df-muted">
      No projects yet
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="df-class-project-help"
            aria-label="Why no projects are shown"
            onClick={() => setOpen(true)}
          >
            <Info size={14} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64" side="top" sideOffset={6}>
          Students must assign their projects to this classroom before they
          appear here.
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
