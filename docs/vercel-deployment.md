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
| Build command | `npm run build:verified` (set in `vercel.json`) |
| Output directory | Next.js default |
| Node.js | 22.x or 24.x |

If this project previously used a studio subfolder, clear that Root Directory value before deploying the refactored commit. If a deployment reports that Next.js cannot be detected, check that Vercel is using the root `package.json`, which is named `dreamforge` and declares `next`.

## Environment and data

Configure the required production values from `.env.example` in Vercel's environment settings. Server credentials belong only in private server environment variables. Preserve the existing Supabase database, Runtime API key and prepared starter snapshot when moving the deployment root; this is a repository reorganisation, not a new database or project-workspace migration.

Apply required SQL migrations using a server-authorised connection before enabling account features that depend on them. The existing `adorable` database schema and internal `/adorable` VM state paths remain compatible with live projects. Do not rename these values as part of deployment setup.

Blank projects in Production require `RUNTIME_BASE_SNAPSHOT`; a missing or invalid setting fails before compute is allocated instead of cloning and installing packages in the user's request. Build a clean memory snapshot with `npm run bootstrap`, configure its ID in the target environment, then run `npm run runtime:check-starter` with that environment's Runtime key and snapshot ID before deploying. The check creates one disposable workspace, verifies writable storage, installed dependencies, compiled preview and the inherited server process, pauses and wakes it, then deletes it in `finally`. It consumes a small amount of Runtime compute. Use `npm run runtime:check-starter -- --metadata-only` for a read-only state/expiry check. Repeat the full check whenever changing the starter setting; starter validation is deliberately outside individual project creation requests.

Source browsing is available while preview health checks run. File requests prepare workspace permissions without starting or waiting for the preview server. Runtime preparation reuses an existing named server process without opening a terminal WebSocket; ordinary pause/wake retains the process and compilation cache. Cold boots and missing processes still recover the server.

## Domains

Once a production deployment is Ready, add the desired domain under Settings → Domains and connect it to Production. Domain assignment is managed in Vercel; renaming source folders does not transfer or release a `vercel.app` address. Enable automatic production-domain assignment if pushes to `main` should update the public site.

The production domain is currently `dreamforge2.vercel.app`. Set `DREAMFORGE_SITE_URL` to the active production origin so invitation and payment links use the correct address.

## Automated tests and release gates

The `DreamForge CI` GitHub Actions workflow runs on pull requests and pushes to `main`. Its `Tests and build` job installs dependencies, runs deterministic harness and safety tests, checks quota accounting and execution recovery against a temporary local PostgreSQL database, and builds the production app. These checks need no production credentials and create no Runtime VMs or production projects.

Vercel's build command is `npm run build:verified`: deterministic tests must pass before `next build` starts, and both must succeed before Vercel releases the deployment. Production builds also run the disposable prepared-starter check against their actual Runtime key and snapshot setting before building. Local and Preview builds skip this live check. A failed test, starter check or build leaves the existing production deployment serving traffic. Keep the Build Command override disabled in Vercel so the repository's command is used.

To also require the database checks before releasing, once the first workflow has run, open Vercel's project Settings → Deployment Checks and select `Tests and build`. Vercel will then wait for the full GitHub Actions check before assigning production domains. See [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks). Without this setting, the database tests run in GitHub Actions but are not part of Vercel's release gate.

In GitHub Settings → Rules → Rulesets, protect `main` by requiring a pull request and the `Tests and build` status check. Enable the requirement that branches are up to date before merging. This prevents merging changes that failed CI; Vercel's own test and build gate also covers direct pushes.

Same-repository pull requests also run the `Live project journey` job against their exact Vercel preview commit. It uses a dedicated test account to create and reopen a project, submit prompts, check replies and generated previews, and remove the disposable project afterward. These tests consume Runtime and model credits. Fork PRs run the deterministic checks without live credentials. See [E2E configuration and coverage](e2e/prompting.md).

## Verification

Run `npm ci`, the local harness tests, and `npm run build` from the repository root. After deployment, use a dedicated E2E account and follow [the E2E instructions](e2e/prompting.md). Every live test project must be removed afterward, including its Runtime snapshots and Supabase records.

Older deployment procedures and receipts are documented in [historical deployment notes](history/vercel-deployment.md); use this page for the current repository layout.
