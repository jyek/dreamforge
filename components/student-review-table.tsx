import { Children, isValidElement, type ReactNode } from "react";
import { SimpleLoading } from "./dream-loading";
/** Shared table shell for student rosters, projects and prompt reviews. */
export function StudentReviewTable({
  children,
  empty = false,
  busy = false,
  compact = true,
  className = "",
  columns = 1,
  loadingLabel = "Loading…",
}: {
  children: ReactNode;
  empty?: boolean;
  busy?: boolean;
  compact?: boolean;
  className?: string;
  columns?: number;
  loadingLabel?: string;
}) {
  return (
    <div
      className={`df-card df-guidance-table ${compact ? "df-student-overview-table" : ""} ${className}`}
      aria-busy={busy}
      data-empty={empty}
    >
      <div className="df-table-scroll">
        <table className="df-table">
          {busy ? (
            <>
              {Children.toArray(children).filter(
                (child) => isValidElement(child) && child.type === "thead",
              )}
              <tbody>
                <tr>
                  <td colSpan={columns} className="df-table-loading">
                    <SimpleLoading inline label={loadingLabel} />
                  </td>
                </tr>
              </tbody>
            </>
          ) : (
            children
          )}
        </table>
      </div>
    </div>
  );
}
