# DreamForge

DreamForge helps students build apps and games with AI and gives teachers classroom, project and safety oversight. This repository contains the production Next.js application at its root.

## Develop

Use Node.js 22 or newer, and run all commands from the repository root:

```sh
npm ci
cp .env.example .env.local
# Configure the private server environment before starting.
npm run dev
```

The web interface and API run on Next.js. Supabase stores accounts, classrooms, project metadata and conversations; Runtime hosts generated project environments; the configured model provider performs coding and moderation.

## Validate

```sh
npm run test:prompting
npm run test:safety-execution
npm run build
```

The execution tests require PostgreSQL command-line tools and Chrome (or `TEST_BROWSER_EXECUTABLE`). Live E2E tests use a dedicated disposable account, consume configured provider/runtime allowance, and automatically remove test projects and snapshots. See [E2E instructions](docs/e2e/prompting.md).

## Deploy on Vercel

Import `jyek/dreamforge`, select **Next.js**, and use the **repository root**. Leave Root Directory empty; do not enter a studio subfolder. Set the production branch to `main`, configure production environment variables, then deploy. See [deployment setup](docs/vercel-deployment.md).

## Repository layout

- `app/`: Next.js pages and server API routes.
- `components/`, `hooks/`: student and teacher interfaces.
- `lib/`: coding harness, runtime integration, safety, storage and verification.
- `scripts/`: runtime, account, migration and E2E maintenance commands.
- `supabase/`: production SQL migrations and database checks.
- `tests/`: harness, safety, execution and browser regressions.
- `public/`: DreamForge branding and static assets.
- `hosting/static-games/`: optional static game hosting worker, separate from Vercel.
- `docs/`: current setup and implementation notes; historical deployment notes are under `docs/history/`.

The earlier Vite prototype is archived outside this repository. It is not part of the production build.

## Existing data compatibility

Application data belongs in the private `dreamforge` schema. See [database setup and consolidation](docs/database-schema.md) for the fresh-install baseline and guarded upgrade from the earlier schema. Supabase's `auth`, `storage`, and extension schemas remain separate. Original SQL migrations are retained in `supabase/history`.

Stored Runtime snapshots still use `/adorable` for internal project state. Those filesystem paths and provider resource identifiers remain unchanged so saved projects keep working.

Keep credentials, deployment receipts and generated test reports in ignored local files. Do not publish `.env*` files or embed provider/service credentials in generated projects.

## Attribution

DreamForge's original coding harness was adapted from the MIT-licensed [Freestyle Adorable project](https://github.com/freestyle-sh/Adorable). Its upstream license is retained in [LICENSE](LICENSE).
