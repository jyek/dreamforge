import type { ReactNode } from "react";
import { EmptyStateArt, type EmptyStateIllustration } from "./empty-state-art";

export function TableEmptyState({
  title,
  description,
  action,
  illustration = "projects",
  framed = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  illustration?: EmptyStateIllustration;
  framed?: boolean;
}) {
  return (
    <div className={framed ? "df-table-empty df-empty-panel" : "df-table-empty"}>
      <EmptyStateArt variant={illustration} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="df-table-empty-action">{action}</div>}
    </div>
  );
}
