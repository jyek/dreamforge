import type { ReactNode } from "react";
export function TableEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="df-table-empty">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 76"
        width="100"
        height="76"
        fill="none"
      >
        <circle cx="49" cy="38" r="31" fill="#f4efff" />
        <path
          d="M12 59c10-17 31 8 39-6"
          stroke="#c4b5fd"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
        <path
          d="m34 32 42-13-12 34-13-12-17-9Z"
          fill="#e4d8ff"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="m51 41 25-22-18 28-7-6Z" fill="#c4b5fd" />
        <path
          d="m51 41 25-22M51 41l1 13 6-7"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="m24 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#c4b5fd" />
        <path
          d="m82 48 1.5 4.5L88 54l-4.5 1.5L82 60l-1.5-4.5L76 54l4.5-1.5L82 48Z"
          fill="#f3ce75"
        />
      </svg>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="df-table-empty-action">{action}</div>}
    </div>
  );
}
