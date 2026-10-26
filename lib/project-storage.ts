import {ensureFinalResponse} from './final-response';
import { type UIMessage } from "ai";
import { database } from "./database";
import type { PoolClient } from "pg";
export const usesDatabaseStorage = () => process.env.PROJECT_STORAGE === "supabase";
import { devVm } from "./project-vm";
import type {
  ProjectConversationSummary,
  ProjectMetadata,
  ProjectRelease,
} from "./project-types";
import { PROJECT_STATE_DIR } from "./vars";

/** Supabase is authoritative when configured; VM JSON supports legacy deployments. */
const METADATA_PATH = `${PROJECT_STATE_DIR}/project.json`;

const conversationPath = (conversationId: string) => {
  if (!/^[a-f0-9-]{36}$/i.test(conversationId)) throw new Error("Invalid conversation ID");
  return `${PROJECT_STATE_DIR}/conversations/${conversationId}.json`;
};

export const readProjectMetadata = async (
  projectId: string,
): Promise<ProjectMetadata> => {
  if (usesDatabaseStorage()) {
    const { rows } = await database().query("select metadata from projects where vm_id=$1", [projectId]);
    if (!rows[0]) throw new Error("Project not found");
    return rows[0].metadata;
  }
  const raw = await devVm(projectId).fs.readTextFile(METADATA_PATH);
  return JSON.parse(raw) as ProjectMetadata;
};

export const writeProjectMetadata = async (
  projectId: string,
  metadata: ProjectMetadata,
) => {
  if (usesDatabaseStorage()) {
    await database().query("insert into projects(vm_id,metadata) values($1,$2) on conflict(vm_id) do update set metadata=excluded.metadata,updated_at=now()", [projectId, JSON.stringify(metadata)]);
    // A created workspace must rest even if its creator closes the browser
    // before the first activity request reaches Vercel.
    await database().query("insert into runtime_leases(vm_id,last_activity) values($1,now()) on conflict(vm_id) do nothing", [projectId]);
    return metadata;
  }
  await devVm(projectId).fs.writeTextFile(
    METADATA_PATH,
    JSON.stringify(metadata, null, 2),
  );
  return metadata;
};

/** Database updates lock each project row to preserve concurrent changes. */
const updateProjectMetadata = async (
  projectId: string,
  update: (metadata: ProjectMetadata) => ProjectMetadata,
) => {
  if (usesDatabaseStorage()) return withProjectLock(projectId, async (db, current) => {
    const next = update(current);
    await db.query("update projects set metadata=$2,updated_at=now() where vm_id=$1", [projectId, JSON.stringify(next)]);
    return next;
  });
  const current = await readProjectMetadata(projectId);
  return writeProjectMetadata(projectId, update(current));
};


async function withProjectLock<T>(projectId: string, work: (db: PoolClient, metadata: ProjectMetadata) => Promise<T>): Promise<T> {
  const db = await database().connect();
  try {
    await db.query("begin");
    const { rows } = await db.query("select metadata from projects where vm_id=$1 for update", [projectId]);
    if (!rows[0]) throw new Error("Project not found");
    const result = await work(db, rows[0].metadata);
    await db.query("commit");
    return result;
  } catch (error) { await db.query("rollback"); throw error; } finally { db.release(); }
}

export async function listStoredProjects() {
  const { rows } = await database().query("select vm_id,metadata from projects order by updated_at desc");
  return rows as { vm_id: string; metadata: ProjectMetadata }[];
}

const deriveConversationTitle = (
  messages: UIMessage[],
  fallback: string,
): string => {
  const userMessage = messages.find((message) => message.role === "user");
  const textPart = userMessage?.parts?.find((part) => part.type === "text");
  const text = textPart && "text" in textPart ? textPart.text : "";
  const clean = text.trim().replace(/\s+/g, " ");
  return clean ? clean.slice(0, 60) : fallback;
};

export const createConversation = async (
  projectId: string,
  conversationId: string,
  initialTitle?: string,
) => {
  conversationPath(conversationId);
  const now = new Date().toISOString();
  if (usesDatabaseStorage()) return withProjectLock(projectId, async (db, current) => {
    const next = {...current, conversations: [{id: conversationId, title: initialTitle?.trim().replace(/\s+/g, " ").slice(0,60) || `Conversation ${current.conversations.length + 1}`, createdAt: now, updatedAt: now}, ...current.conversations]};
    await db.query("insert into conversations(vm_id,id,messages) values($1,$2,'[]')", [projectId, conversationId]);
    await db.query("update projects set metadata=$2,updated_at=now() where vm_id=$1", [projectId, JSON.stringify(next)]);
    return next;
  });

  const [metadata] = await Promise.all([
    updateProjectMetadata(projectId, (current) => ({
      ...current,
      conversations: [
        {
          id: conversationId,
          title:
            initialTitle?.trim().replace(/\s+/g, " ").slice(0, 60) ||
            `Conversation ${current.conversations.length + 1}`,
          createdAt: now,
          updatedAt: now,
        },
        ...current.conversations,
      ],
    })),
    devVm(projectId).fs.writeTextFile(conversationPath(conversationId), "[]"),
  ]);

  return metadata;
};

export const readConversationMessages = async (
  projectId: string,
  conversationId: string,
): Promise<UIMessage[]> => {
  conversationPath(conversationId);
  if (usesDatabaseStorage()) {
    const { rows } = await database().query("select messages from conversations where vm_id=$1 and id=$2", [projectId, conversationId]);
    if (!rows[0]) throw new Error("Conversation not found");
    return ensureFinalResponse(rows[0].messages).messages;
  }
  const raw = await devVm(projectId).fs.readTextFile(
    conversationPath(conversationId),
  );
  return ensureFinalResponse(JSON.parse(raw) as UIMessage[]).messages;
};

export const saveConversationMessages = async (
  projectId: string,
  conversationId: string,
  messages: UIMessage[],
) => {
  conversationPath(conversationId);
  const now = new Date().toISOString();
  if (usesDatabaseStorage()) return withProjectLock(projectId, async (db, current) => {
    const existing = current.conversations.find(entry => entry.id === conversationId);
    if (!existing) throw new Error("Conversation not found");
    const summary = {...existing, title: deriveConversationTitle(messages, existing.title), updatedAt: now};
    const next = {...current, conversations: [summary, ...current.conversations.filter(entry => entry.id !== conversationId)]};
    await db.query("update conversations set messages=$3,updated_at=now() where vm_id=$1 and id=$2", [projectId, conversationId, JSON.stringify(messages)]);
    await db.query("update projects set metadata=$2,updated_at=now() where vm_id=$1", [projectId, JSON.stringify(next)]);
    return next;
  });

  const [metadata] = await Promise.all([
    updateProjectMetadata(projectId, (current) => {
      const existing = current.conversations.find(
        (conversation) => conversation.id === conversationId,
      );
      const summary: ProjectConversationSummary = {
        id: conversationId,
        title: deriveConversationTitle(
          messages,
          existing?.title ?? `Conversation ${current.conversations.length + 1}`,
        ),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      return {
        ...current,
        conversations: [
          summary,
          ...current.conversations.filter(
            (conversation) => conversation.id !== conversationId,
          ),
        ],
      };
    }),
    devVm(projectId).fs.writeTextFile(
      conversationPath(conversationId),
      JSON.stringify(messages, null, 2),
    ),
  ]);

  return metadata;
};

export const addRelease = (projectId: string, release: ProjectRelease) =>
  updateProjectMetadata(projectId, (current) => ({
    ...current,
    releases: [release, ...current.releases].slice(0, 50),
  }));

export const updateRelease = (
  projectId: string,
  releaseId: string,
  patch: Partial<ProjectRelease>,
) =>
  updateProjectMetadata(projectId, (current) => ({
    ...current,
    releases: current.releases.map((release) =>
      release.id === releaseId ? { ...release, ...patch } : release,
    ),
    liveReleaseId: patch.state === "live" ? releaseId : current.liveReleaseId,
  }));

/** Record the production VM the first publish created. */
export const setProdVmId = (projectId: string, prodVmId: string | null) =>
  updateProjectMetadata(projectId, (current) => ({ ...current, prodVmId }));

export const setStaticProductionUrl = (projectId: string, url: string | null) =>
  updateProjectMetadata(projectId, current => ({...current,staticProductionUrl:url}));

export const setProductionDomain = (projectId: string, domain: string) =>
  updateProjectMetadata(projectId, (current) => ({
    ...current,
    productionDomain: domain,
  }));

export const renameProject = (projectId: string, name: string) =>
  updateProjectMetadata(projectId, (current) => ({ ...current, name }));
