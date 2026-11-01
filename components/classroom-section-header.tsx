import type { ReactNode } from "react";
export function ClassroomSectionHeader({
  title,
  id,
  action,
}: {
  title: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <div className="df-section-head df-classroom-section-header">
      <h3 id={id}>{title}</h3>
      {action}
    </div>
  );
}
