/** Only project detail routes get the editor/preview layout. New application
 * routes must never be interpreted as project IDs by default. */
export function projectWorkspaceRoute(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 1 || parts.length > 2 || !/^vm-[a-z0-9]+$/.test(parts[0]))
    return null;
  return { projectId: parts[0], conversationId: parts[1] || null };
}
