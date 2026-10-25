import { assertRun, markEdit, event, currentRun } from "./execution";
import { verifyApp, interactionSchema } from "./verification";
import { tool } from "ai";
import { z } from "zod";
import type { Vm } from "./project-runtime";
import {
  codeRisk,
  redactIdentity,
  screenContent,
  SafetyError,
} from "./kids-safety";
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const fileSchema = z
  .string()
  .max(240)
  .regex(
    /^(app|src|components|styles|public)\/[A-Za-z0-9_./-]+\.(tsx?|jsx?|css|json|svg)$/,
  )
  .describe(
    "Relative project path, for example app/page.tsx. Include app/ or another allowed source directory; do not include /workspace/.",
  );
function path(file: string) {
  if (
    file.includes("..") ||
    file.includes("/.") ||
    file.includes("\\") ||
    /(?:^|\/)(?:api|route\.[jt]sx?|middleware\.[jt]s|proxy\.[jt]s|instrumentation\.[jt]s)(?:\/|$)/.test(
      file,
    ) ||
    file.endsWith("middleware.ts")
  )
    throw new SafetyError("That file is outside your learning workspace.");
  return "/workspace/" + file;
}
export function studentTools(
  vm: Vm,
  projectId: string,
  userId: string | null,
  aliases: string[],
) {
  async function childFile(
    operation: "read" | "write" | "list",
    target: string,
    content?: string,
  ) {
    const script =
      `const fs=require('fs'),path=require('path');const target=${JSON.stringify(target)};${operation === "write" ? "fs.mkdirSync(path.dirname(target),{recursive:true});" : ""}const parent=fs.realpathSync(${operation === "write" ? "path.dirname(target)" : "target"});if(!parent.startsWith('/workspace/'))throw Error('Outside workspace');` +
      (operation === "write"
        ? `fs.writeFileSync(target,${JSON.stringify(content)}, {flag:'w'});`
        : operation === "read"
          ? `process.stdout.write(fs.readFileSync(target,'utf8').slice(0,30000));`
          : `process.stdout.write(JSON.stringify(fs.readdirSync(target)));`);
    // Unprivileged I/O makes a symlink race unable to reach server-owned files or credentials.
    const result = await vm.exec({
      command: `sudo setpriv --reuid=dreamforge --regid=dreamforge --init-groups --no-new-privs env -i HOME=/home/dreamforge PATH=/usr/local/bin:/usr/bin:/bin node -e ${quote(script)}`,
      timeoutMs: 10000,
    });
    if (result.statusCode !== 0)
      throw new SafetyError("This source file is unavailable.");
    return result.stdout || "";
  }
  async function assertPlainPath(target: string) {
    const segments = target.split("/").filter(Boolean);
    const paths = segments.map(
      (_, i) => "/" + segments.slice(0, i + 1).join("/"),
    );
    const check = await vm.exec({
      command: paths.map((p) => `test ! -L '${p}'`).join(" && "),
    });
    if (check.statusCode !== 0)
      throw new SafetyError("Linked files cannot be accessed.");
  }
  const tools = {
    readFileTool: tool({
      description: "Read a source file within the learning workspace.",
      inputSchema: z.object({ file: fileSchema }),
      execute: async ({ file }) => {
        const target = path(file);
        await assertPlainPath(target);
        const content = redactIdentity(
          await childFile("read", target),
          aliases,
        );
        await screenContent(projectId, userId, "tool", content);
        return { content };
      },
    }),
    writeFileTool: tool({
      description:
        "Write a complete safe source file. External network requests, secrets, system access and shell execution are unavailable.",
      inputSchema: z.object({
        file: fileSchema,
        content: z.string().max(30000),
      }),
      execute: async ({ file, content }) => {
        const target = path(file);
        const safe = redactIdentity(content, aliases);
        if (codeRisk(safe))
          throw new SafetyError(
            "That code needs teacher review before it can run.",
          );
        await screenContent(projectId, userId, "tool", safe);
        // vm.exec and filesystem APIs follow symlinks: refuse symlink ancestors before writing.
        await assertPlainPath(target);
        await assertRun();
        await markEdit(file);
        await childFile("write", target, safe);
        return { ok: true, file };
      },
    }),
    listFilesTool: tool({
      description: "List the existing app source files.",
      inputSchema: z.object({}),
      execute: async () => ({
        entries: JSON.parse(await childFile("list", "/workspace/app")),
      }),
    }),
    checkAppTool: tool({
      description:
        "Collect revision-specific compilation, browser rendering, runtime error and optional button interaction evidence. An HTTP response is not proof of a working app. humanTested is never set by this tool.",
      inputSchema: z.object({ interactions: interactionSchema }),
      execute: async ({ interactions }) => verifyApp(vm, interactions),
    }),
  };
  // Serialize tool execution, including parallel calls from a provider. Never log source or prompts.
  let tail: Promise<unknown> = Promise.resolve();
  for (const [name, value] of Object.entries(tools)) {
    const execute = value.execute!;
    value.execute = ((...args: Parameters<typeof execute>) => {
      const next = tail.then(async () => {
        const run = await assertRun();
        await event(run, "tool.started", { name });
        try {
          const result = await (
            execute as unknown as (...values: unknown[]) => unknown
          )(...args);
          await event(run, "tool.completed", { name });
          return result;
        } catch (error) {
          await event(run, "tool.failed", { name });
          throw error;
        }
      });
      const active = currentRun();
      active?.pending.add(next);
      void next.finally(() => active?.pending.delete(next)).catch(() => {});
      tail = next.catch(() => {});
      return next;
    }) as typeof execute;
  }
  return tools;
}
