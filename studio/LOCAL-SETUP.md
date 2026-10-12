# Local Adorable trial

Installed separately at `/Users/justinyek/Code/adorable`.

Open http://127.0.0.1:55476 while the development server is running.

## Start again

```bash
cd /Users/justinyek/Code/adorable
export PATH="/Users/justinyek/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
npm run dev -- --hostname 127.0.0.1 --port 55476
```

The ignored file `adorable/.env` contains server-side credentials. Do not commit or share it. This trial uses Freestyle for project VMs and OpenRouter with `cohere/north-mini-code:free` for coding. The local UI and API run on your Mac; created projects run in your Freestyle account and have live `style.dev` preview URLs. The selected model has zero token charges, subject to OpenRouter free-model request limits. Freestyle usage remains subject to your account plan.

The `adorable-base-small` snapshot has already been built. Run `npm run bootstrap --workspace=adorable` only when rebuilding the project template. The temporary bootstrap VM is removed after snapshot creation.

Local compatibility changes enable the current Freestyle API endpoint, writable VM template directories, free preview domains, and an OpenRouter-compatible model endpoint with an 8192-token response limit.

The classroom implementation includes Dreamforge login, Supabase ownership, token accounting, teacher controls and safety adapter boundaries. It is disabled in this shared trial.

## Shared demo and classroom mode

The actual Adorable application is hosted directly at https://dreamforge.vercel.app on Vercel. It has no student login or token quotas. Project metadata, chats and activity leases live in Supabase; source code and live previews remain on Freestyle project VMs. The Vercel UI and API have no Sites proxy. Set `STUDENT_LOGIN_ENABLED=true` to enable the Supabase login, teacher controls and token budgets. See `adorable/docs/vercel-deployment.md` for the current deployment and `adorable/docs/student-harness.md` for classroom implementation boundaries.

New projects use 2 vCPU / 4 GiB VMs. Twenty-minute inactivity controls and static publishing are deployed. Static games are hosted separately on `dreamforge-games.jyek.chatgpt.site`. See `adorable/docs/hosted-deployment.md`.
