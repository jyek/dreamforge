# Direct Vercel deployment

Adorable runs directly at https://dreamforge.vercel.app (Vercel project `jyek-projects/adorable`). The production alias `dreamforge.vercel.app` is declared in `vercel.json`, so CLI production deployments keep updating this address. The Next.js UI and API are served together, without the Sites proxy. `SITES_PROXY_SECRET` and `PUBLIC_APP_ORIGIN` are absent; mutation origins must match the direct app origin. The shared demo remains enabled (`STUDENT_LOGIN_ENABLED=false`).

Supabase project `xntxjufcgtwtxeejzdtb` is the authoritative store for project metadata, conversation messages and runtime activity. The private `adorable` schema keeps these records separate from the existing classroom tables. Its tables have RLS enabled and no browser role grants. Only server-side PostgreSQL credentials access them. Supabase login and classroom features remain disabled.

Four existing projects and seven conversations were imported from Freestyle VM JSON. Subsequent app writes go to Supabase, with project row locks and transactions protecting concurrent metadata and conversation changes. The original VM JSON remains a migration backup, not the current source of truth. The former Freestyle application backend service was stopped and its VM paused after checking that all original metadata and messages match the migrated database. Source code, preview servers and terminal sessions remain on Freestyle project VMs. Published static games retain their existing separate static host.

## Credentials and deployment

The ignored `adorable/.env` contains the local credentials. Vercel production environment variables are provisioned with `scripts/configure-vercel.mjs` during initial setup. Database traffic uses the Supabase transaction pooler on port 6543 with verified TLS and the bundled `config/supabase-ca.crt`. Functions run in `icn1`, matching the database's Seoul region. `.vercelignore` excludes environment files, runtime state and private deployment receipts.

Deploy from the app directory:

```bash
cd /Users/justinyek/Code/adorable/adorable
vercel deploy --prod --yes --scope jyek-projects
```

The app has its own deployment lockfile derived from the validated monorepo dependencies; Freestyle is pinned to `0.2.2`. Update and verify both lockfiles when changing dependencies. The first migration is `scripts/migrate-supabase-storage.mts`; it skips already imported projects and does not overwrite database state.

## Serverless lifecycle

Activity and publish holds live in `adorable.runtime_leases`, rather than a local file. A Supabase Cron job runs every minute and calls the protected Vercel maintenance endpoint only when idle projects or stale releases need work. The authentication token is in Supabase Vault and Vercel's `CRON_SECRET`, not in the scheduled SQL. `scripts/configure-runtime-cron.mjs https://dreamforge.vercel.app` configures or updates this job. Freestyle's native 1200-second idle timeout remains enabled.

Vercel does not start a process-local idle watchdog. Publishing registers its background promise with Next.js `after`, so it continues after the initial API response. Hobby functions have a 300-second deadline; releases still unfinished after six minutes are marked failed by maintenance, allowing a retry. Builds that consistently need more than five minutes require a durable publishing worker or a different Vercel plan. Terminal SSE sends an initial response and keepalives, closes and detaches before the function deadline, and permits immediate cancellation. Serverless streams own their sockets. Input requests use temporary sockets; the browser serializes input and reattaches output afterward, resetting the display before replaying the same guest shell’s retained scrollback.

## Validation

The production build, LLM step regressions, database concurrency checks, conversation integrity checks and RLS checks passed. `tests/supabase-storage.mts` verifies concurrent conversation creation and chat/rename writes without losing metadata, rejects missing or invalid conversation IDs, and removes its temporary database project.

`scripts/smoke-vercel.mjs <origin>` checks the direct UI, migrated histories, request origin validation, protected maintenance, new project creation, a streamed real AI answer persisted in Supabase, source access, terminal SSE, live preview and background publishing. Its temporary project receipt is ignored under `.deployment`; remove test resources after verification.

The live checks verified a real shell command through Vercel input and replay, stream cancellation, background static publishing after the API response, and authenticated Supabase Cron HTTP maintenance that paused an expired test workspace. The Vercel activity endpoint resumed that same workspace. The test VM, database records and domain mappings were removed afterward.

## Project navigation

The project toolbar opens a slide-out navigation menu instead of a back arrow or permanent conversation rail. It provides New project, All projects, Code, Terminal, searchable projects and expandable History. Existing chat records are retained; the project root continues opening the latest conversation. Hosted checks verified menu-to-Code navigation, project search, history access and drawer selection/closure.

## Coding model choices

The prompt composer allows the configured default plus `deepseek/deepseek-v4.1-flash` and `z-ai/glm-5.3-flash`. Both additions are paid OpenRouter models. Selection is remembered in browser local storage and sent on each request. The server rejects IDs outside the allowlist, and all choices use the same safety path. Classroom token reservations record the selected model. Model availability and tool support were checked against OpenRouter’s live model catalogue.

Cohere North Mini Code (`cohere/north-mini-code:free`) remains the default. If a Cohere provider call reports a quota/rate-limit error (429), its same model step is retried with paid `qwen/qwen3-coder`, and later steps in that request use Qwen. Each new request tries Cohere again. Partial provider output is buffered before tool execution, so retries cannot duplicate a partial tool call; completed earlier steps are retained. Non-quota errors and manual DeepSeek/GLM choices do not trigger this fallback. Qwen is also selectable directly. Simulated HTTP and mid-stream quota failures passed with final text and no repeated tool execution.

## Empty agent responses

A provider can return a blank final completion before the step limit. `lib/final-response.ts` adds an explicitly labelled Harness status when the final assistant message has no non-whitespace text. It reports only confirmed tool writes and basic app availability, distinguishes failures, and does not claim visual or gameplay correctness. Streaming paths insert the status before the finish event; safety screening includes it before delivery/persistence. Older empty final turns receive the same status on read without rewriting their stored records. Deterministic SDK streaming tests reproduce empty provider output and verify visible and persisted text.

### Sharing and model selection

The workspace preview waits for the runtime API to confirm that the app responds
before mounting its iframe. During resume it shows “Starting up your VM…” and
polls for readiness, then opens the preview automatically. A cold boot recreates
the named dev-server session. Freestyle compute-limit errors show a clear
allowance message and a retry action; they do not display a proxy 502 or spin
indefinitely. The direct `style.dev` domain still uses Freestyle's own error page
when its VM cannot run.

The workspace Share action displays and copies the project's direct preview URL.
It is available immediately, does not create a release or call the publishing
API, and is independent of the publishing safety gate. The preview shows current
edits and requires the workspace VM to be running. Existing `/s/{projectId}` links
remain compatible with previously published releases, including their VM wake-up
behavior, but the Share dialog does not generate those links.

The shared demo defaults to Auto: Cohere's free model while OpenRouter reports
remaining daily quota, then Qwen3 Coder 30B. Provider congestion alone does not
permit paid fallback. Free only never uses paid inference. Manual coding model
choices persist in the browser. Paid requests have no application-level daily spending cap. Provider price
filters continue to select low-cost routes. OpenRouter account credit and
provider limits still apply.
