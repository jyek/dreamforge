# Deploy DreamForge on Vercel

The production Next.js application is at the **repository root**. There is no npm workspace wrapper or separate prototype app in this repository.

## Project settings

| Setting | Value |
| --- | --- |
| Git repository | `jyek/dreamforge` |
| Production branch | `main` |
| Framework preset | Next.js |
| Root Directory | Leave empty (repository root) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default |
| Node.js | 22.x or 24.x |

If this project previously used a studio subfolder, clear that Root Directory value before deploying the refactored commit. If a deployment reports that Next.js cannot be detected, check that Vercel is using the root `package.json`, which is named `dreamforge` and declares `next`.

## Environment and data

Configure the required production values from `.env.example` in Vercel's environment settings. Server credentials belong only in private server environment variables. Preserve the existing Supabase database, Runtime API key and prepared starter snapshot when moving the deployment root; this is a repository reorganisation, not a new database or project-workspace migration.

Apply required SQL migrations using a server-authorised connection before enabling account features that depend on them. The existing `adorable` database schema and internal `/adorable` VM state paths remain compatible with live projects. Do not rename these values as part of deployment setup.

## Domains

Once a production deployment is Ready, add the desired domain under Settings → Domains and connect it to Production. Domain assignment is managed in Vercel; renaming source folders does not transfer or release a `vercel.app` address. Enable automatic production-domain assignment if pushes to `main` should update the public site.

The refactor itself does not change Vercel settings, assign domains or deploy the application.

## Verification

Run `npm ci`, the local harness tests, and `npm run build` from the repository root. After deployment, use a dedicated E2E account and follow [the E2E instructions](e2e/prompting.md). Every live test project must be removed afterward, including its Runtime snapshots and Supabase records.

Older deployment procedures and receipts are documented in [historical deployment notes](history/vercel-deployment.md); use this page for the current repository layout.
