import type { ReactNode } from "react";

export function ProfileModuleHeader({
  title,
  description,
  eyebrow,
  id,
}: {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  id?: string;
}) {
  return (
    <header className="df-profile-module-header">
      {eyebrow && <span className="df-pill">{eyebrow}</span>}
      <h2 id={id}>{title}</h2>
      <p className="df-muted">{description}</p>
    </header>
  );
}
