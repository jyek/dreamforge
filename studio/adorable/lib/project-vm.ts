import { requestSandboxCreation } from "./runtime-provisioning";
import { database } from "./database";
import { prepareProjectRuntime } from "./prepare-project-runtime";
import { randomUUID } from "crypto";
import type { Vm } from "./project-runtime";
import {
  bindRuntime,
  deleteRuntime,
  projectVm,
  runtime,
  runtimeSandbox,
} from "./project-runtime";
import {
  BLANK_PROJECT_COMMAND,
  TEMPLATE_COMPATIBILITY_COMMAND,
} from "./blank-project.mjs";
import { activityCommand } from "../scripts/activity-bridge.mjs";
import {
  ADORABLE_DIR,
  APP_SESSION,
  VM_PORT,
  WORKDIR,
  PROJECT_IDLE_SECONDS,
  TEMPLATE_REPO,
} from "./vars";

export const devVm = projectVm;
export const prodVm = projectVm;
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export async function startDevServer(vm: Vm) {
  const session = await vm.pty.open({
    slug: APP_SESSION,
    exec: `cd ${WORKDIR} && npm run dev -- --hostname 0.0.0.0 > /adorable/dev.log 2>&1`,
    cols: 120,
    rows: 30,
  });
  session.detach();
}
export async function restartDevServer(vm: Vm) {
  await vm.pty.close(APP_SESSION).catch(() => {});
  await startDevServer(vm);
}

/** The failed HTTP probe already established that repair is needed. */
export async function restoreProjectServer(projectId: string): Promise<void> {
  const sandbox = await runtimeSandbox(projectId); // one fresh provider status
  if (
    sandbox.state === "paused" ||
    sandbox.state === "pausing" ||
    sandbox.state === "resuming"
  ) {
    await sandbox.wake(); // memory resumes with its running server intact
    return;
  }
  if (sandbox.state === "stopped") await sandbox.restart();
  await startDevServer(devVm(projectId));
}

export type CreatedProjectVms = {
  projectId: string;
  previewDomain: string;
  productionDomain: string;
};

/** Provision Runtime compute while retaining provider-independent project URLs. */
export async function createProjectVms(
  name: string,
  sourceRepoUrl?: string,
): Promise<CreatedProjectVms> {
  const projectId = `vm-${randomUUID().replaceAll("-", "")}`;
  const prepared = Boolean(process.env.RUNTIME_BASE_SNAPSHOT) && !sourceRepoUrl;
  let sandboxId: string | undefined;
  let sandbox: Awaited<ReturnType<typeof runtimeSandbox>>;
  try {
    sandboxId = await requestSandboxCreation({
      name: `dreamforge-${projectId}`,
      vcpu: 2,
      memoryMiB: 4096,
      diskMiB: 10240,
      idlePauseSeconds: PROJECT_IDLE_SECONDS,
      autoWake: true,
      labels: { application: "dreamforge", projectId, role: "dev" },
      ...(prepared ? { snapshot: process.env.RUNTIME_BASE_SNAPSHOT } : {}),
    });
    sandbox = await runtime().sandboxes.get(sandboxId, { timeoutMs: 15000 });
    if (sandbox.state !== "running")
      await sandbox.waitFor("running", {
        timeoutSeconds: 60,
        timeoutMs: 70000,
      });
    if (sandbox.state !== "running")
      throw Object.assign(Error("Project hosting did not start."), {
        code: "hosting_start_timeout",
      });
  } catch (error) {
    // A timed-out create can have allocated compute. Reconcile only this exact
    // request's generated name/label; never retry under a different identity.
    try {
      if (sandboxId)
        await runtime().sandboxes.delete(sandboxId, { timeoutMs: 15000 });
      else
        for await (const candidate of await runtime().sandboxes.list(
          {
            name: `dreamforge-${projectId}`,
            labels: { projectId },
            includeStopped: true,
          },
          { timeoutMs: 10000 },
        )) {
          if (candidate.info.name === `dreamforge-${projectId}`)
            await candidate.delete({ timeoutMs: 15000 });
        }
    } catch {
      console.error("project.provision.cleanup.failed", { projectId });
    }
    throw error;
  }
  try {
    await bindRuntime(projectId, sandbox.id);
    const vm = devVm(projectId);
    const setup = await vm.exec({
      command: `sudo mkdir -p ${ADORABLE_DIR}/conversations && sudo chown -R $(id -u):$(id -g) ${ADORABLE_DIR}`,
      timeoutMs: 30000,
    });
    if (setup.statusCode !== 0)
      throw Error("Could not prepare workspace storage");
    if (!process.env.RUNTIME_BASE_SNAPSHOT || sourceRepoUrl) {
      const repo = sourceRepoUrl || TEMPLATE_REPO;
      const install = await vm.exec({
        command: `git clone --depth 1 ${quote(repo)} /tmp/dreamforge-source && cp -a /tmp/dreamforge-source/. ${WORKDIR}/ && rm -rf /tmp/dreamforge-source && cd ${WORKDIR} && npm install --no-audit --no-fund`,
        timeoutMs: 240000,
      });
      if (install.statusCode !== 0)
        throw Error(
          `Could not prepare project: ${install.stderr?.slice(-500) || install.stdout?.slice(-500)}`,
        );
    }
    if (!sourceRepoUrl && !prepared) {
      const reset = await vm.exec({
        command: BLANK_PROJECT_COMMAND + "\n" + TEMPLATE_COMPATIBILITY_COMMAND,
      });
      if (reset.statusCode !== 0)
        throw Error("Could not prepare a blank project");
    }
    if (prepared) {
      const manifest = JSON.parse(
        await vm.fs.readTextFile("/adorable/starter.json"),
      );
      if (manifest.version !== "next-shadcn-v1")
        throw Error("Unsupported prepared starter version.");
    } else {
      const activity = await vm.exec({ command: activityCommand });
      if (activity.statusCode !== 0)
        throw Error("Could not prepare preview activity tracking");
    }
    const preview = await sandbox.previews.create(VM_PORT, {
      visibility: "private",
      ttlSeconds: 7 * 86400,
    });
    if (!prepared) await prepareProjectRuntime(projectId);
    await database().query(
      "update adorable.runtime_bindings set preview=$2 where project_id=$1",
      [
        projectId,
        JSON.stringify({
          url: preview.urlWithToken || preview.url,
          baseUrl: preview.url,
          token: preview.token,
          expiresAt: preview.tokenExpiresAt,
        }),
      ],
    );
    const previewDomain = new URL(preview.url).host;
    return { projectId, previewDomain, productionDomain: previewDomain };
  } catch (error) {
    await deleteRuntime(projectId).catch(() => {});
    await sandbox.delete().catch(() => {});
    throw error;
  }
}

export async function listProjectVms() {
  const page = await runtime().sandboxes.list({
    labels: { application: "dreamforge", role: "dev" },
  });
  return page.data.map((s) => ({
    id: s.info.labels.projectId,
    createdAt: s.info.createdAt,
  }));
}
export async function deleteProjectVms(projectId: string, prodVmId: string) {
  await deleteRuntime(projectId);
  if (prodVmId) await deleteRuntime(prodVmId);
}

export async function createProdVm(
  projectId: string,
  name: string,
  _domain: string,
) {
  const source = await runtimeSandbox(projectId);
  const clone = await source.fork({
    name: `dreamforge-live-${randomUUID()}`,
    labels: { application: "dreamforge", role: "prod", projectId },
  });
  const id = `vm-${randomUUID().replaceAll("-", "")}`;
  try {
    await bindRuntime(id, clone.id);
    await clone.previews.create(VM_PORT, {
      visibility: "private",
      ttlSeconds: 7 * 86400,
    });
    return id;
  } catch (error) {
    await clone.delete();
    throw error;
  }
}
