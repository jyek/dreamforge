"use client";

import { usePathname } from "next/navigation";
import { projectWorkspaceRoute } from "@/lib/project-workspace-route";
import { ProjectWorkspaceShell } from "./[projectId]/project-workspace-shell";

export function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const route = projectWorkspaceRoute(usePathname());
  if (!route) return <>{children}</>;
  return (
    <ProjectWorkspaceShell
      projectId={route.projectId}
      selectedConversationIdOverride={route.conversationId}
    >
      {children}
    </ProjectWorkspaceShell>
  );
}
