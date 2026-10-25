import { connectVerificationBrowser } from "./verification-browser";
import { bounded } from "./bounded";
import type { BrowserContext } from "playwright-core";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assertRun, event } from "./execution";
import { database } from "./database";
import { runtimePreview } from "./project-runtime";
import type { Vm } from "./project-runtime";

export const interactionSchema = z
  .array(
    z.object({
      button: z.string().min(1).max(100),
      expectedText: z.string().min(1).max(150),
    }),
  )
  .max(8)
  .default([]);
export function verificationPassed(value: {
  compilation: string;
  rendering: string;
  runtimeErrors: string[];
  interactions: { passed: boolean }[];
}) {
  return (
    value.compilation === "passed" &&
    value.rendering === "passed" &&
    value.runtimeErrors.length === 0 &&
    value.interactions.every((i) => i.passed)
  );
}
const browserServices = {
  preview: runtimePreview,
  connect: connectVerificationBrowser,
};
export async function verifyApp(
  vm: Vm,
  interactions: z.infer<typeof interactionSchema>,
  services = browserServices,
  stageTimeoutMs = 10000,
) {
  const run = await assertRun();
  const revision = run.revision;
  const evidence = {
    revision,
    checkedAt: new Date().toISOString(),
    compilation: "not-run",
    compilationErrors: [] as { file: string; line: number; code: string }[],
    rendering: "not-run",
    pageLoaded: false,
    runtimeErrors: [] as string[],
    interactions: [] as {
      button: string;
      expectedText: string;
      passed: boolean;
    }[],
    humanTested: false,
    screenshotHash: null as string | null,
    screenshotStatus: "not-run",
    screenshotUnavailable: null as string | null,
    unavailable: null as string | null,
    ok: false,
  };
  await event(run, "verification.started", { revision });
  // Check all source against the trusted project options, excluding generated dev
  // cache validators which can be stale or mid-regeneration during a file edit.
  const configPath = `/tmp/dreamforge-types-${run.id}.json`;
  const config = JSON.stringify({
    extends: "/workspace/tsconfig.json",
    include: [
      "/workspace/next-env.d.ts",
      "/workspace/**/*.ts",
      "/workspace/**/*.tsx",
    ],
    exclude: ["/workspace/node_modules", "/workspace/.next"],
  });
  const createConfig = `require('fs').writeFileSync(${JSON.stringify(configPath)},${JSON.stringify(config)},{flag:'wx',mode:0o644})`;
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
  const compiled = await vm.exec({
    command: `cd /workspace && trap 'rm -f ${configPath}' EXIT; node -e ${quote(createConfig)} && node node_modules/typescript/bin/tsc --project ${configPath} --noEmit --incremental false`,
    timeoutMs: 45000,
  });
  evidence.compilation = compiled.statusCode === 0 ? "passed" : "failed";
  evidence.compilationErrors = [
    ...(compiled.stdout || "").matchAll(
      /(?:\/workspace\/)?((?:app|src|components|styles)\/[A-Za-z0-9_./-]+)\((\d+),\d+\): error (TS\d+):/g,
    ),
  ]
    .slice(0, 20)
    .map((m) => ({ file: m[1], line: Number(m[2]), code: m[3] }));
  // Never return raw compiler logs: source snippets can contain unscreened/private content.
  const endpoint =
    process.env.VERIFICATION_BROWSER_WS ||
    (process.env.VERIFICATION_BROWSER_BUILTIN === "true"
      ? "builtin"
      : undefined);
  if (!endpoint) evidence.unavailable = "Browser checks are not configured.";
  else
    try {
      const browser = await bounded(services.connect(endpoint), stageTimeoutMs);
      let context: BrowserContext | undefined;
      const abort = () => {
        void bounded(context ? context.close() : browser.close(), 1000).catch(
          () => {},
        );
      };
      run.signal.addEventListener("abort", abort, { once: true });
      try {
        context = await bounded(
          browser.newContext({
            serviceWorkers: "block",
            acceptDownloads: false,
          }),
          stageTimeoutMs,
        );
        const preview = await services.preview(run.projectId);
        const page = await bounded(context.newPage(), stageTimeoutMs);
        page.setDefaultTimeout(3000);
        page.on("pageerror", () => {
          if (evidence.runtimeErrors.length < 20)
            evidence.runtimeErrors.push("Uncaught application error");
        });
        page.on("console", (message) => {
          if (message.type() === "error" && evidence.runtimeErrors.length < 20)
            evidence.runtimeErrors.push("Browser console error");
        });
        const response = await page.goto(preview.url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        evidence.pageLoaded = response?.status() === 200;
        evidence.rendering =
          evidence.pageLoaded &&
          (await page.locator("body").innerText()).trim().length > 0
            ? "passed"
            : "failed";
        for (const step of interactions) {
          await assertRun();
          try {
            await page
              .getByRole("button", { name: step.button, exact: true })
              .click();
            await page
              .getByText(step.expectedText, { exact: true })
              .waitFor({ state: "visible", timeout: 3000 });
            evidence.interactions.push({ ...step, passed: true });
          } catch {
            evidence.interactions.push({ ...step, passed: false });
            break;
          }
        }
        // Screenshot infrastructure failing must not erase observed rendering
        // or successful interactions. It is optional evidence, not a game test.
        try {
          evidence.screenshotHash = createHash("sha256")
            .update(await page.screenshot({ timeout: 5000 }))
            .digest("hex");
          evidence.screenshotStatus = "passed";
        } catch {
          evidence.screenshotStatus = "unavailable";
          evidence.screenshotUnavailable =
            "Screenshot capture did not complete.";
        }
      } catch {
        evidence.rendering = "failed";
        evidence.unavailable = "Browser check did not complete.";
      } finally {
        run.signal.removeEventListener("abort", abort);
        if (context) await bounded(context.close(), 5000).catch(() => {});
        await bounded(browser.close(), 5000).catch(() => {});
      }
    } catch {
      evidence.unavailable = "Verification browser is unavailable.";
      evidence.rendering = "not-run";
    }
  await assertRun();
  evidence.ok =
    verificationPassed(evidence) &&
    evidence.interactions.length === interactions.length;
  const { rowCount } = await database().query(
    "update adorable.project_execution set verification=$3 where project_id=$1 and active_run=$2 and revision=$4",
    [run.projectId, run.id, JSON.stringify(evidence), revision],
  );
  if (!rowCount) throw Error("Verification became stale.");
  await event(run, "verification.finished", evidence);
  return evidence;
}
