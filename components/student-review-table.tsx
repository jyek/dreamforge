import type { ReactNode } from "react";
/** Shared dashboard table appearance and loading state. */
export function StudentReviewTable({
  children,
  empty = false,
  busy = false,
  compact = true,
  className = "",
  columns = 1,
  loadingLabel = "Loading…",
  tableClassName = "",
}: {
  children: ReactNode;
  empty?: boolean;
  busy?: boolean;
  compact?: boolean;
  className?: string;
  columns?: number;
  loadingLabel?: string;
  tableClassName?: string;
}) {
  return (
    <div
      className={`df-card df-guidance-table ${compact ? "df-student-overview-table" : ""} ${className}`}
      aria-busy={busy}
      data-empty={empty}
    >
      {busy ? (
        <div
          className="df-table-skeleton"
          role="status"
          aria-label={loadingLabel}
        >
          <span className="sr-only">{loadingLabel}</span>
          <div aria-hidden="true">
            {Array.from({ length: 5 }, (_, row) => (
              <div
                className="df-table-skeleton-row"
                key={row}
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: columns }, (_, col) => (
                  <span className="df-table-skeleton-bar" key={col} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="df-table-scroll">
          <table className={`df-table ${tableClassName}`}>{children}</table>
        </div>
      )}
    </div>
  );
}
