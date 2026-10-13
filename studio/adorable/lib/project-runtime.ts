import { Runtime } from "withruntime";
import type { Terminal } from "withruntime";
import { database } from "./database";

export type Vm = ProjectVm;
export type PtySession = {
  detach: () => void;
  write: (data: string) => void;
  resize: (size: { cols: number; rows: number }) => void;
  signal: (signal: "sigint" | "sigkill") => Promise<void>;
};
let client: Runtime | undefined;
export const runtime = () => (client ??= new Runtime({ waitForCapacityMs: 0 }));

/** Stable DreamForge project IDs are independent of the compute provider. */
export async function runtimeSandbox(projectId: string) {
  const { rows } = await database().query(
    "select sandbox_id from adorable.runtime_bindings where project_id=$1",
    [projectId],
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error(
        "This project's files still need to be moved from Freestyle. Its saved conversations are preserved.",
      ),
      { code: "PROJECT_MIGRATION_REQUIRED" },
    );
  }
  return runtime().sandboxes.get(rows[0].sandbox_id);
}

export async function bindRuntime(projectId: string, sandboxId: string) {
  await database().query(
    "insert into adorable.runtime_bindings(project_id,sandbox_id) values($1,$2)",
    [projectId, sandboxId],
  );
}

type PtyOptions = {
  slug?: string;
  session?: string | number;
  exec?: string;
  cols?: number;
  rows?: number;
  onData?: (data: Uint8Array) => void;
  onClose?: (info: unknown) => void;
  onError?: (error: unknown) => void;
};
const terminalPath = (slug: string | number) => {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(String(slug)))
    throw Error("Invalid terminal session");
  return `/adorable/terminals/${slug}.json`;
};
class ProjectVm {
  constructor(readonly id: string) {}
  private sandbox = () => runtimeSandbox(this.id);
  fs = {
    readTextFile: async (path: string) =>
      (await this.sandbox()).files.readText(path),
    readFile: async (path: string) => (await this.sandbox()).files.read(path),
    writeTextFile: async (path: string, content: string) =>
      (await this.sandbox()).files.write(path, content),
    writeFile: async (path: string, content: Uint8Array) =>
      (await this.sandbox()).files.write(path, content),
    exists: async (path: string) => (await this.sandbox()).files.exists(path),
    readDir: async (path: string) =>
      (await (await this.sandbox()).files.list(path, { depth: 1 })).map(
        (e) => ({ name: e.name, kind: e.type }),
      ),
    remove: async (path: string) =>
      (await this.sandbox()).files.remove(path, { recursive: true }),
  };
  async data() {
    const info = (await this.sandbox()).info;
    return {
      ...info,
      resources: {
        cpu: info.vcpu,
        memory: info.memoryMiB,
        storage: info.diskMiB,
      },
    };
  }
  async start() {
    const sandbox = await this.sandbox();
    if (sandbox.state === "stopped") await sandbox.restart();
    else if (sandbox.state !== "running") await sandbox.wake();
    return sandbox.info;
  }
  async pause() {
    return (await this.sandbox()).pause();
  }
  async exec(input: string | { command: string; timeoutMs?: number }) {
    const options = typeof input === "string" ? { command: input } : input;
    const result = await (
      await this.sandbox()
    ).exec(options.command, { timeoutMs: options.timeoutMs });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      statusCode: result.timedOut ? null : result.exitCode,
    };
  }
  async snapshot(options: { displayName?: string }) {
    const snapshot = await (
      await this.sandbox()
    ).snapshot({ name: options.displayName, retentionDays: 7 });
    return { snapshotId: snapshot.id };
  }
  private async session(
    options: PtyOptions,
    create: boolean,
  ): Promise<PtySession> {
    const sandbox = await this.sandbox();
    const slug = options.slug || options.session || "shell";
    const path = terminalPath(slug);
    let processId: string | undefined;
    try {
      processId = JSON.parse(await sandbox.files.readText(path)).processId;
      const process = await sandbox.processes.get(processId!);
      if (process.state !== "running") processId = undefined;
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        (error as { status?: number }).status !== 404
      )
        throw error;
      processId = undefined;
    }
    if (!processId) {
      if (!create) throw Error("Terminal session is not running");
      const process = await sandbox.spawn(options.exec || "bash -l", {
        pty: { cols: options.cols || 120, rows: options.rows || 30 },
        stdin: "pipe",
      });
      processId = process.id;
      try {
        await sandbox.files.mkdir("/adorable/terminals", { parents: true });
        await sandbox.files.write(path, JSON.stringify({ processId }));
      } catch (error) {
        await process.kill("SIGKILL").catch(() => {});
        throw error;
      }
    }
    const terminal: Terminal = await sandbox.terminal({
      processId,
      onData: options.onData,
    });
    void terminal.exited
      .then(() => options.onClose?.({}))
      .catch(options.onError || (() => {}));
    return {
      detach: () => terminal.close(),
      write: (data) => terminal.write(data),
      resize: ({ cols, rows }) => terminal.resize(cols, rows),
      signal: (signal) =>
        sandbox.processes
          .get(processId!)
          .then((p) => p.kill(signal === "sigint" ? "SIGINT" : "SIGKILL")),
    };
  }
  pty = {
    open: (options: PtyOptions) => this.session(options, true),
    attach: (options: PtyOptions) => this.session(options, false),
    close: async (slug: string) => {
      const sandbox = await this.sandbox();
      const path = terminalPath(slug);
      const { processId } = JSON.parse(await sandbox.files.readText(path));
      await (await sandbox.processes.get(processId)).kill("SIGKILL");
      await sandbox.files.remove(path);
    },
  };
}
export const projectVm = (projectId: string): Vm => new ProjectVm(projectId);

export async function runtimePreview(projectId: string, fresh = false) {
  const { rows } = await database().query(
    "select preview from adorable.runtime_bindings where project_id=$1",
    [projectId],
  );
  const saved = rows[0]?.preview as
    | {
        url: string;
        baseUrl: string;
        token: string | null;
        expiresAt: string | null;
      }
    | undefined;
  if (
    !fresh &&
    saved &&
    (!saved.expiresAt || Date.parse(saved.expiresAt) > Date.now() + 3600000)
  )
    return saved;
  const sandbox = await runtimeSandbox(projectId);
  // Free accounts require bearer links. Never expose the account API key.
  const preview = await sandbox.previews.get(3000, 7 * 86400);
  const result = {
    url: preview.urlWithToken || preview.url,
    baseUrl: preview.url,
    token: preview.token,
    expiresAt: preview.tokenExpiresAt,
  };
  await database().query(
    "update adorable.runtime_bindings set preview=$2 where project_id=$1",
    [projectId, JSON.stringify(result)],
  );
  return result;
}

export async function deleteRuntime(projectId: string) {
  const { rows } = await database().query(
    "select sandbox_id from adorable.runtime_bindings where project_id=$1",
    [projectId],
  );
  if (!rows[0]) return; // An unmigrated legacy VM stays archived.
  await runtime().sandboxes.delete(rows[0].sandbox_id);
  await database().query(
    "delete from adorable.runtime_bindings where project_id=$1",
    [projectId],
  );
}
