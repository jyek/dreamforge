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

## Migration

Apply `supabase/migrations/202610130001_runtime_bindings.sql`, then run:

```bash
npm run runtime:migrate -- /absolute/path/to/private.env /absolute/path/to/backup-directory
```

The private environment file supplies `DATABASE_URL`, `FREESTYLE_API_KEY`, `FREESTYLE_BASE_URL` and `RUNTIME_API_KEY`. The script backs up metadata, conversations and project source with SHA-256 manifests, copies source to Runtime, reinstalls dependencies, verifies preview readiness and key source checksums, then pauses the destination. It retains the original Freestyle VMs. Re-running skips projects already bound to Runtime.

Never commit the private environment file, backups or bearer URLs. The production deployment only needs `RUNTIME_API_KEY` plus its existing Supabase/model configuration; Freestyle credentials are needed only for legacy migration tooling.

## Validation

The provider smoke test checks a real Next.js preview, live edits, persistent files, pause/wake and named terminal reconnection. Validate the deployed `/api/projects`, runtime readiness, file reading and preview before completing cutover.
