import { appendFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token, E2E_COMMIT_SHA: sha } = process.env;
if (!repo || !token || !/^[a-f0-9]{40}$/.test(sha || ""))
  throw Error("Set GITHUB_REPOSITORY, GITHUB_TOKEN and E2E_COMMIT_SHA.");
async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`GitHub deployment lookup failed: HTTP ${response.status}`);
  return response.json();
}
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const deployments = await api(`deployments?sha=${sha}&per_page=30`);
  const preview = deployments.find((d) => d.environment === "Preview" && d.sha === sha);
  if (preview) {
    const [status] = await api(`deployments/${preview.id}/statuses?per_page=1`);
    if (["failure", "error"].includes(status?.state)) throw Error("Vercel preview deployment failed.");
    if (status?.state === "success") {
      const url = new URL(status.environment_url);
      if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app"))
        throw Error("Expected an HTTPS Vercel preview URL.");
      await appendFile(process.env.GITHUB_OUTPUT, `url=${url.origin}\n`);
      console.log(`Ready: ${url.origin} at ${sha}`);
      process.exit(0);
    }
  }
  await setTimeout(5000);
}
throw Error("No successful Vercel preview for this PR commit within ten minutes.");
