import type { ReactNode } from "react";
/** Shared table shell for student rosters, projects and prompt reviews. */
export function StudentReviewTable({
  children,
  empty = false,
  busy = false,
  compact = true,
  className = "",
}: {
  children: ReactNode;
  empty?: boolean;
  busy?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`df-card df-guidance-table ${compact ? "df-student-overview-table" : ""} ${className}`}
      aria-busy={busy}
      data-empty={empty}
    >
      <div className="df-table-scroll">
        <table className="df-table">{children}</table>
      </div>
    </div>
  );
}
