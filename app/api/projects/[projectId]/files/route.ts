import { prepareProjectWorkspace } from "@/lib/prepare-project-runtime";
import { authorizeProject } from "@/lib/project-access";
import { WORKDIR } from "@/lib/vars";
import { snapshotInProgress } from "@/lib/execution";
import { runtimeFailure } from "@/lib/runtime-readiness";

const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const readable = (file: string) =>
  file.length < 1024 &&
  !file.startsWith("/") &&
  !file.includes("\0") &&
  file
    .split("/")
    .every(
      (segment) =>
        segment &&
        segment !== ".." &&
        !segment.startsWith(".env") &&
        !["node_modules", ".next", ".git", ".ssh"].includes(segment),
    ) &&
  (file === ".gitignore" ||
    /\.(tsx?|jsx?|mjs|cjs|json|css|scss|html|md|txt|ya?ml|toml|svg)$/.test(
      file,
    ));
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const file = new URL(request.url).searchParams.get("file");
  if (!/^vm-[a-z0-9]+$/.test(projectId) || (file !== null && !readable(file)))
    return Response.json(
      { error: "Invalid source file path" },
      { status: 400 },
    );
  if (!(await authorizeProject(projectId, true)))
    return Response.json({ error: "Project not found" }, { status: 404 });
  try {
    if (await snapshotInProgress(projectId))
      return Response.json(
        { error: "Project snapshot is being prepared." },
        { status: 409 },
      );
    const vm = await prepareProjectWorkspace(projectId);
    const result = await vm.exec({
      command: `cd ${quote(WORKDIR)} && find . -maxdepth 8 \\( -name node_modules -o -name .npm -o -name .cache -o -name .pnpm-store -o -name .yarn -o -name .next -o -name .git -o -name '.env*' -o -name .ssh \\) -prune -o -type f -size -256k -print0`,
      timeoutMs: 15000,
    });
    if (result.statusCode !== 0) throw Error("File listing failed");
    const files = (result.stdout || "")
      .split("\0")
      .map((path) => path.replace(/^\.\//, ""))
      .filter(readable)
      .sort()
      .slice(0, 1000);
    if (file === null)
      return Response.json(
        { files },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (!files.includes(file))
      return Response.json(
        { error: "This file is unavailable or too large to view" },
        { status: 404 },
      );
    const resolved = await vm.exec({
      command: `realpath -e -- ${quote(WORKDIR + "/" + file)}`,
      timeoutMs: 15000,
    });
    const path = (resolved.stdout || "").trim();
    if (resolved.statusCode !== 0 || !path.startsWith(WORKDIR + "/"))
      return Response.json(
        { error: "File is outside the project" },
        { status: 403 },
      );
    const content = await vm.fs.readTextFile(path);
    if (Buffer.byteLength(content) > 256 * 1024)
      return Response.json(
        { error: "File is too large to view" },
        { status: 413 },
      );
    return Response.json(
      { file, content },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const failure = runtimeFailure(error);
    return Response.json(
      {
        error:
          failure.body.state === "blocked"
            ? failure.body.error
            : "Could not load project files. Please try again.",
      },
      { status: failure.status },
    );
  }
}
