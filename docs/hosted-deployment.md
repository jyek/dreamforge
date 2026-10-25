> Historical reference: this describes an earlier Freestyle/Sites deployment. Use [Vercel deployment setup](vercel-deployment.md) for the current app.

# Historical hosted deployment

The current deployment is direct Vercel hosting at https://dreamforge.vercel.app with Supabase storage. See [vercel-deployment.md](./vercel-deployment.md). The Freestyle application backend and Sites proxy described below are the previous deployment.

The existing `dreamforge-studio-demo.jyek.chatgpt.site` URL serves the actual Adorable Next.js app through a streaming Sites Worker proxy. The Worker lives at `/Users/justinyek/Documents/Game/sites/dreamforge-studio-demo/worker/index.js`. It forwards HTML, assets, API requests, AI response streams and terminal streams to the backend; there is no substitute frontend or browser-local chat simulation.

The backend runs as a persistent systemd service on a separate Freestyle Ubuntu VM. Project VMs remain separate from the application VM. Backend metadata does not mark it as a project, so it is excluded from the shared project list and coding tools cannot select it as a project. OpenRouter and Freestyle API credentials stay in the backend's private runtime environment. Supabase credentials are not copied into this shared-demo deployment.

The backend requires `x-sites-backend-token` on every request, including static assets. Sites stores this token as the `ADORABLE_PROXY_SECRET` secret, and the public browser never receives it. `ADORABLE_BACKEND_URL` points to the backend's HTTPS `style.dev` domain. Mutation requests retain the browser's Origin; backend middleware validates it against `PUBLIC_APP_ORIGIN`.

## Deployment status

Deployed successfully on 2026-10-11 after the owner added a card to unlock Freestyle allowances. Sites version 2 serves the actual app. The application VM is `vm-285690e245a44d55a3eebcaad87900bf`; its HTTPS endpoint is `https://adorable-backend-1e116831a4.style.dev`, protected by the proxy secret. Anonymous direct requests return 401. Hosted creation, AI file editing, interactive preview and publishing were verified. The trial release at https://adorable-48eb781c-live.style.dev was opened and its counter responded to clicks.

## Redeploy

1. Ensure the Freestyle account has available VM allowance.
2. Run `npm run build` from the repository root. Package `.next/standalone` preserving its monorepo directory structure, and copy `.next/static` into `adorable/.next/static` within the archive. Include `public` if present. Remove all `.env*` files before archiving as `/tmp/adorable-runtime.tgz`.
3. Run `node scripts/deploy-demo-backend.mjs` from the repository root. This loads credentials from ignored `.env`, provisions a persistent VM, uploads the archive, sets server-side environment variables, installs a systemd service and maps HTTPS. It reuses the private receipt in `.deployment/backend.json` on subsequent runs. Keep this file private: it contains the proxy secret.
4. Through the native Sites environment tool, set `ADORABLE_BACKEND_URL` to the receipt's HTTPS domain, and `ADORABLE_PROXY_SECRET` to the receipt's secret with `is_secret=true`. Preserve other site settings and its public audience.
5. In the existing Sites checkout, run the source workflow with `bash scripts/build.sh` and `node scripts/validate-artifact.mjs`, then save the returned commit/archive and deploy that saved version to the existing project ID in `.openai/hosting.json`.
6. Verify the actual hosted app: no classroom header/login/quota; all projects listed; create a project; send a coding prompt; confirm generated file changes and interactive preview; publish and open the release. Confirm direct backend requests without the secret return 401.

Freestyle and the free OpenRouter model retain their provider account limits; disabling student quotas does not remove those limits. This shared trial gives visitors edit access to all trial projects, as requested. Enable classroom mode and complete its safety requirements before student use.

## LLM response smoke tests (2026-10-11)

The shooter conversation had two assistant turns with exactly five model steps, all tool activity and no written answer. The former five-step cutoff stopped the agent while it was investigating. Demo requests now allow up to 20 steps, with the final step reserving a tool-free written answer. Classroom requests retain their five-step budget and accounting hooks.

Run `npx tsx tests/llm-smoke.ts` for deterministic provider tests that verify a seven-step tool chain ends in text, the five-step classroom budget ends in text, and reservation/settlement hooks fire on every step. This test makes no remote model requests. Run `node scripts/smoke-hosted.mjs` for the deployed session, project listing, original conversation and persisted real answer, invalid request and cross-origin checks, preview root and shooter route. Live browser tests additionally submit an actual prompt and verify its answer appears in the original conversation.

## Workspace UI (2026-10-12)

The hosted workspace now uses a narrower chat column, rounded full-height preview and Preview / Code / Terminal tabs. Preview is selected by default and its iframe stays mounted when switching tabs, preserving interactive state. Terminal mounts only when selected. Code provides a searchable read-only view of the project VM source, with line numbers and refresh. The server validates project access, excludes environment and build/dependency folders, rejects traversal and absolute paths, verifies the resolved file remains in the workspace, and caps file size and listing count.

Production build and LLM step regression tests passed. `node scripts/smoke-workspace.mjs` checks real file listing/content, environment and invalid path rejection, missing files, session and terminal SSE. Hosted browser QA verified Code loads source, Terminal is a separate view, and the counter remains at 1 after switching through Code and Terminal back to Preview. Screenshots are at `/Users/justinyek/Documents/Game/adorable-workspace-preview.png` and `/Users/justinyek/Documents/Game/adorable-code-view.png`.

## Small runtimes and static publishing (2026-10-12)

New development and server-production VMs use `adorable-base-small` (2 vCPU, 4 GiB, 16 GB disk). Existing VM shapes are unchanged. Project VMs have `idleTimeoutSeconds=1200`. The application additionally tracks student interactions, including events forwarded from the preview, and checks inactivity every 30 seconds. It pauses development VMs after approximately 20 minutes without activity, excluding active publishing jobs. Model steps refresh activity. The studio disconnects inactive previews/terminals and offers Resume. Opening a project resumes it. Home cards no longer embed live previews, preventing the gallery from waking all projects.

The backend's private `/app/runtime-state/leases.json` persists activity across app restarts. It is an operational lease store, separate from project metadata and conversations. Project metadata remains `/adorable/project.json`; conversations remain `/adorable/conversations/<id>.json`. Reading JSON through Freestyle filesystem APIs does not require waking a paused VM.

Publishing first tries a Next.js static export in a temporary source copy, with public asset paths adjusted for a release prefix. It uploads generated output to the `BUCKET` R2 binding on `dreamforge-games.jyek.chatgpt.site`, a separate origin from the editor. Uploads require a private bearer secret. SHA-256 and byte counts are validated before activating the release. The published game requires no project production VM and remains usable while the development VM is paused. Older static artifacts support rollback without rebuilding. Apps with server routes/actions or incompatible static-export features use the existing production-VM publishing path with the smaller template. Ordinary compilation failures are reported rather than silently published.

Public URLs use `/p/<projectId>` and redirect to immutable release paths. Static hosting currently supports the Next.js templates used by this harness, not arbitrary frameworks. The application backend remains on its existing Freestyle VM; these changes do not guarantee staying within all free-tier limits.

Validation: a real small VM was provisioned; a simulated expired activity lease caused an actual VM pause; JSON stayed readable without waking it; re-entry resumed the same VM. A generated counter was statically published and its controls worked while the development VM was paused. A test API triggered server fallback on a small production VM, served JSON, and rolled back to static. The test-only production VM was removed. Production build, two LLM-loop regressions and six classroom safety/quota tests passed.

The previously published demo counter (`vm-7a92c5aca9de4d9d8f9ed3cf949bf7cd`) was also migrated through the hosted Publish API to a live static release. Its prior production VM was paused, retained for rollback. Existing project VM idle settings and activity bridges were applied by `scripts/migrate-idle-settings.mjs`.

## Resizable workspace (2026-10-12)

History and chat collapse controls share the project title row, aligned with the preview toolbar. The desktop chat divider supports pointer dragging and arrow keys, with its width remembered locally. Home no longer offers the GitHub import dialog. Production build and hosted drag, keyboard, refresh persistence, and home-page checks passed.
