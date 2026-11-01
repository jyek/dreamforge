"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
export function DashboardDetailHeader({
  title,
  subtitle,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(
    () => setTarget(document.getElementById("dashboard-detail-header")),
    [],
  );
  return target
    ? createPortal(
        <div className="df-detail-header">
          {back && <div className="df-detail-back">{back}</div>}
          <div className="df-detail-heading">
            <h1>{title}</h1>
            {subtitle && <p className="df-muted">{subtitle}</p>}
          </div>
        </div>,
        target,
      )
    : null;
}
