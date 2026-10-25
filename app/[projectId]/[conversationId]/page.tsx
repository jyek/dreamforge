import { notFound } from "next/navigation";
import { Assistant } from "../../assistant";
import { ProjectWelcome } from "@/components/assistant-ui/project-welcome";
import { authorizeProject } from "@/lib/project-access";
import { readConversationMessages } from "@/lib/project-storage";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
}) {
  const { projectId, conversationId } = await params;

  if (!(await authorizeProject(projectId, true))) notFound();
  const initialMessages = await readConversationMessages(
    projectId,
    conversationId,
  );

  const readOnly = !(await authorizeProject(projectId));
  return (
    <Assistant
      key={`${projectId}:${conversationId}`}
      initialMessages={initialMessages}
      selectedProjectId={projectId}
      selectedConversationId={conversationId}
      welcome={<ProjectWelcome />}
      readOnly={readOnly}
    />
  );
}
