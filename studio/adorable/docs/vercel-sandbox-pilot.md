# Vercel Sandbox pilot

The production checkpoint is on `codex/archive-before-vercel-sandbox`. This implementation is on `codex/vercel-sandbox-test`; it does not migrate existing project files, change the production provider, or update the production idle settings.

## What the test implements

- A persistent Next.js/Tailwind/shadcn workspace with a blank initial page.
- A separate `/sandbox-test` control page for creation, live file edits, stop/save, resume, and cleanup.
- Two vCPUs, 4 GiB RAM, and five minutes without activity before stopping and saving the filesystem. Active preview interactions refresh the session deadline.
- One retained snapshot per workspace, expiring after seven days for this pilot.
- Automatic dev-server restart when a stopped workspace resumes.
- No Supabase project or chat writes. The local production-VM watchdog is disabled in pilot mode.
- Test API disabled unless `VERCEL_SANDBOX_TEST_ENABLED=true`, and always disabled in production deployments. Use a protected Vercel preview deployment or localhost.

## Run

From `studio/adorable`, run `npm ci` through the workspace root, link to the existing Vercel project, and run `vercel env pull .env.local` to obtain local OIDC credentials. Keep this file private.

```bash
npm run sandbox:test
PUBLIC_APP_ORIGIN=http://127.0.0.1:55477 VERCEL_SANDBOX_TEST_ENABLED=true npm run dev -- --hostname 127.0.0.1 --port 55477
```

Open `http://127.0.0.1:55477/sandbox-test`. The command test builds a reusable base, verifies a real Next.js preview, source edits, command execution, file persistence, stable preview URL, and dev-server restart, then deletes its temporary workspace. The prepared base remains stopped for subsequent UI tests. Remove UI workspaces with **Remove test workspace**; delete the base through Vercel Sandbox when the pilot is finished.

## Cost estimate (USD, checked October 13, 2026)

For 2 vCPUs and 4 GiB, assuming 10% average CPU utilization:

| Provider | Compute per running hour | 100 total running workspace-hours |
| --- | ---: | ---: |
| Vercel Sandbox | $0.1104 | $11.04 |
| Runtime | $0.0350 | $3.50 |
| Current Freestyle shape | $0.13224 | $13.22 |

These are estimates from list rates, before plan charges, included credits, snapshots/storage, network, and taxes. Vercel rates shown are for `iad1`. Five minutes of idle time instead of twenty cuts the idle tail after each activity session by 75%; it does not imply 75% off the entire bill. Vercel Hobby also has a 45-minute maximum session duration and monthly compute limits. A complete production migration still needs a project-provider adapter, code backup/restore, terminal/tool integration, and handling of maximum session duration.

Sources: [Vercel pricing](https://vercel.com/docs/sandbox/pricing), [persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes), [Runtime pricing](https://withruntime.com/pricing), [Freestyle pricing](https://www.freestyle.sh/docs/vms/pricing-and-limits).
