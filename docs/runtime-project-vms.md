# Runtime project workspaces

DreamForge's Next.js application and API stay on Vercel. Runtime runs project development servers, commands, file tools and named terminals. Supabase remains authoritative for project metadata and conversations.

`adorable.runtime_bindings` maps stable DreamForge `vm-*` project IDs to Runtime sandbox IDs. Moving providers does not change project URLs or conversation IDs. The Runtime API key is server-only; browsers receive only scoped preview links.

## Workspace lifecycle

- 2 vCPUs, 4 GiB RAM, 10 GiB disk.
- New projects retain the Next.js/Tailwind/shadcn framework and begin with a blank page.
- Runtime preserves files, memory and processes when paused. Returning to a project or visiting its preview wakes it; DreamForge also starts the development server when needed.
- Five minutes without user activity pauses the workspace. The existing authenticated Supabase scheduled maintenance call enforces this when background development-server activity prevents Runtime's own idle detector from pausing it.
- Active AI work uses bounded runtime holds. Preview interactions report activity to DreamForge.
- Trial accounts use private bearer preview URLs valid for seven days. Copying the link grants preview access to its recipient. DreamForge refreshes expiring links; old copied links eventually expire. No public proxy is added.
- Runtime's free-account retention applies. The provider currently keeps paused trial sandboxes for seven days. Maintain source backups when keeping projects longer, or add credit for longer provider retention.

## Starter and configuration

Project starters are bundled in `config/project-starter.tar.gz`; bootstrap and cold creation use the same pinned archive. Production needs `RUNTIME_API_KEY`, `RUNTIME_BASE_SNAPSHOT` and the Supabase/model configuration. Retired provider migration scripts have been removed. Existing Runtime bindings and project IDs remain unchanged.

## Validation

The provider smoke test checks a real Next.js preview, live edits, persistent files, pause/wake and named terminal reconnection. Validate the deployed `/api/projects`, runtime readiness, file reading and preview before completing cutover.

## Image references in the shared demo

DeepSeek V4.1 Flash and GLM 5.3 Flash accept PNG, JPEG, WebP and GIF references. The demo permits 32,000 text characters and up to three images totaling 2 MiB per message. Image bytes are stored intact and excluded from text redaction and text safety logs. These local text checks do not moderate image content. Classroom requests retain their existing text-only, 4,000-character policy.

Chat requests send only the latest user message; the server loads stored history so prior images do not inflate every browser request. The combined server-side conversation limit is 3.5 MB.
