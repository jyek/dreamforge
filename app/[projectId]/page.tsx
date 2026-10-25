import { redirect, notFound } from "next/navigation";
import { authorizeProject } from "@/lib/project-access";
import { Assistant } from "../assistant";
import { ProjectWelcome } from "@/components/assistant-ui/project-welcome";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const metadata = await authorizeProject(projectId, true);
  if (!metadata) notFound();
  const latest = [...metadata.conversations].sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0];
  if (latest) redirect(`/${projectId}/${latest.id}`);
  return (
    <Assistant
      initialMessages={[]}
      selectedProjectId={projectId}
      selectedConversationId={null}
      welcome={<ProjectWelcome />}
      readOnly={!(await authorizeProject(projectId))}
    />
  );
}
