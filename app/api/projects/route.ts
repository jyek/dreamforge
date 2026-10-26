import { projectCreationFailure } from "@/lib/project-creation-response";
import { publicGithubRepository } from "@/lib/project-repository";
import { browserPreviewUrl } from "@/lib/preview-access";
import {
  classroomTeacherSQL,
  sharedTeachingProjectSQL,
  teacherStudentAccessSQL,
} from "@/lib/classroom-permissions";
import { getProfile, platformEnabled, checkOrigin } from "@/lib/platform-auth";
import { safetyEnabled } from "@/lib/safety-mode";
import { demoMode } from "@/lib/demo-mode";
import { database } from "@/lib/database";
import { deleteRuntime, runtimePreview } from "@/lib/project-runtime";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  createConversation,
  writeProjectMetadata,
} from "@/lib/project-storage";
import type { ProjectItem, ProjectMetadata } from "@/lib/project-types";
import { createProjectVms, listProjectVms } from "@/lib/project-vm";
import {
  listStoredProjects,
  usesDatabaseStorage,
  readProjectMetadata,
} from "@/lib/project-storage";

const toProjectItem = async (
  id: string,
  metadata: ProjectMetadata,
  readOnly = false,
  requestUrl?: string,
): Promise<ProjectItem> => ({
  id,
  readOnly,
  shellAllowed: !readOnly,
  name: metadata.name,
  previewUrl: safetyEnabled()
    ? browserPreviewUrl(id, requestUrl)
    : (await runtimePreview(id).catch(() => null))?.url ||
      `https://${metadata.previewDomain}`,
  productionUrl: safetyEnabled()
    ? new URL(`/s/${id}`, browserPreviewUrl(id, requestUrl)).toString()
    : metadata.staticProductionUrl || `https://${metadata.productionDomain}`,
  hosting: metadata.staticProductionUrl ? "static" : "server",
  prodVmId: metadata.prodVmId,
  conversations: metadata.conversations,
  releases: metadata.releases,
  liveReleaseId: metadata.liveReleaseId,
});

export const maxDuration = 300;

export async function GET(req: Request) {
  if (safetyEnabled() && demoMode() && !platformEnabled())
    return NextResponse.json(
      {
        projects: [],
        error: "Enable account login for protected learning workspaces.",
      },
      { status: 401 },
    );
  if (platformEnabled()) {
    const user = await getProfile();
    const requested = new URL(req.url).searchParams.get("projectId");
    const { rows } = await database().query(
      `select p.vm_id,p.metadata,p.owner_id,p.is_example from projects p where p.owner_id=$1 or (p.vm_id=$3 and (p.is_example or ($2='teacher' and (${teacherStudentAccessSQL("p.owner_id")} or ${sharedTeachingProjectSQL("p.vm_id", "p.owner_id")})) or ($2='child' and exists(select 1 from class_projects pc join classes c on c.id=pc.class_id join class_members m on m.class_id=c.id where pc.vm_id=p.vm_id and m.child_id=$1 and ${classroomTeacherSQL("c.id", "p.owner_id")})))) order by p.updated_at desc`,
      [user?.id || null, user?.role || null, requested],
    );
    return NextResponse.json({
      projects: await Promise.all(
        rows.map((row) =>
          toProjectItem(
            row.vm_id,
            row.metadata,
            row.is_example || row.owner_id !== user?.id,
            req.url,
          ),
        ),
      ),
    });
  }
  if (demoMode()) {
    if (usesDatabaseStorage()) {
      const stored = await listStoredProjects();
      return NextResponse.json({
        projects: await Promise.all(
          stored.map((row) =>
            toProjectItem(row.vm_id, row.metadata, false, req.url),
          ),
        ),
        demo: true,
      });
    }
    const vms = await listProjectVms();
    const projects = await Promise.all(
      vms.map(async (vm) =>
        toProjectItem(vm.id, await readProjectMetadata(vm.id), false, req.url),
      ),
    );
    return NextResponse.json({ projects, demo: true });
  }
  return NextResponse.json(
    { error: "Enable DreamForge account login." },
    { status: 503 },
  );
}

export async function POST(req: Request) {
  try {
    return await createProject(req);
  } catch (error) {
    const failure = projectCreationFailure(error);
    console.error("project.creation.failed", {
      code: (error as { code?: string })?.code || "unavailable",
    });
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}
async function createProject(req: Request) {
  if (safetyEnabled() && demoMode() && !platformEnabled())
    return NextResponse.json(
      {
        error:
          "Enable account login before creating protected learning workspaces.",
      },
      { status: 401 },
    );
  const platformUser = platformEnabled() ? await getProfile() : null;
  if (platformEnabled()) {
    if (!checkOrigin(req) || !platformUser)
      return NextResponse.json(
        { error: "Sign in to create your own project." },
        { status: 403 },
      );
    if (platformUser.role === "teacher")
      await database().query(
        "insert into token_accounts(child_id) values($1) on conflict do nothing",
        [platformUser.id],
      );
    const { rows } = await database().query(
      "select count(*)::int as count from projects where owner_id=$1",
      [platformUser.id],
    );
    if (rows[0].count >= 10)
      return NextResponse.json(
        {
          error: "Your project limit is 10.",
        },
        { status: 403 },
      );
  }
  if (demoMode() || platformEnabled()) {
    const payload = await req.json().catch(() => ({}));
    if (
      platformEnabled() &&
      (typeof payload.name !== "string" ||
        !payload.name.trim() ||
        payload.name.trim().length > 80)
    )
      return NextResponse.json(
        { error: "Give your project a name using 1–80 characters." },
        { status: 400 },
      );
    let repository;
    try {
      repository = publicGithubRepository(payload.githubRepoName);
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    const name =
      typeof payload.name === "string"
        ? payload.name.trim().slice(0, 80) || "Untitled Project"
        : "Untitled Project";
    const { projectId, previewDomain, productionDomain } =
      await createProjectVms(name, repository);
    try {
      await writeProjectMetadata(projectId, {
        version: 3,
        ...(platformUser &&
        /^e2e_[a-f0-9]{12}$/.test(platformUser.username) &&
        /^E2E(?: |$)/i.test(name) &&
        typeof payload.e2eRunId === "string" &&
        /^[a-f0-9-]{36}$/i.test(payload.e2eRunId)
          ? { e2eRunId: payload.e2eRunId }
          : {}),
        name,
        createdAt: new Date().toISOString(),
        prodVmId: null,
        previewDomain,
        productionDomain,
        conversations: [],
        releases: [],
        liveReleaseId: null,
      });
      if (platformUser)
        await database().query(
          "update projects set owner_id=$2,is_example=false where vm_id=$1",
          [projectId, platformUser.id],
        );
      const conversationId = randomUUID();
      const next = await createConversation(
        projectId,
        conversationId,
        typeof payload.conversationTitle === "string"
          ? payload.conversationTitle
          : undefined,
      );
      return NextResponse.json({
        id: projectId,
        conversationId,
        project: await toProjectItem(projectId, next, false, req.url),
      });
    } catch (error) {
      try {
        await deleteRuntime(projectId);
        await database().query("delete from projects where vm_id=$1", [
          projectId,
        ]);
      } catch (cleanupError) {
        console.error("project.creation.cleanup.failed", {
          projectId,
          code: (cleanupError as { code?: string })?.code || "unavailable",
        });
      }
      throw error;
    }
  }
  return NextResponse.json(
    { error: "Enable DreamForge account login." },
    { status: 503 },
  );
}
