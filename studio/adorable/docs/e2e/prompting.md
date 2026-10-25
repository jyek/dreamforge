# Prompting end-to-end checks

Run from `studio/adorable`.

```bash
npm run test:prompting
npm run test:e2e:prompting
```

`test:prompting` runs 19 harness tests, four HTTP test-runner fixture cases, and five provider simulations. It catches missing final replies, empty-provider retries, tool-only endings, interrupted streams, safety screening and progress delivery without paid API calls.

`test:e2e:prompting` uses the actual deployed app, Supabase, configured model and student runtime. It logs in as a dedicated student, creates a fresh E2E Prompting Playground project, and tests:

- A short streamed reply and saved final text.
- A real counter code edit with streamed tools and a final written summary.
- Generated source and rendered preview HTML, not just a tool's success claim.
- Safety refusal before tools execute, with the blocked prompt persisted safely.
- Cross-origin prompt rejection.

The live command tests API integration. It does not click browser controls, validate responsive layouts, or prove counter interactions. Use `$dreamforge-e2e` in Codex to run the commands and a browser interaction pass.

## Configure once

Create an ignored `.env.e2e.local` with a **dedicated student**, never an actual learner's account:

```dotenv
E2E_BASE_URL=https://dreamforge.vercel.app
E2E_LOGIN=your_test_student
E2E_PASSWORD=your_test_password
E2E_MODEL=glm
```

Alternatively, `npm run test:e2e:setup` provisions a dedicated Supabase auth user, student profile and a finite 1M internal token allowance using `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` from `.env`. It saves random credentials privately to `.env.e2e.local` and refuses to overwrite that file. It creates no class memberships. This internal allowance is not OpenRouter credit; live generation still uses provider credit and runtime capacity. The setup command must target the same Supabase as the app under test. Do not use it with a different deployment's database.

## Results and timing

The command exits nonzero on the first failure. `.e2e-results/latest.json` contains each check's status, duration, first feedback, first model text, project link and preview URL. No passwords, auth cookies or raw response streams are included. The report and reusable project state are ignored by Git.

The default first-feedback budget is 15 seconds, measured from submitting the request through HTTP startup to the first progress label, text or tool event. First model text is recorded separately so heartbeats do not disguise a slow model. Override with `E2E_FEEDBACK_BUDGET_MS`; request timeout defaults to 240 seconds (`E2E_REQUEST_TIMEOUT_MS`). `E2E_MODEL` accepts the app's model selector IDs (`glm`, `deepseek`, `free`, `auto`), subject to server policy. This is a smoke test, not a statistical model benchmark.

Each run adds three test conversations and may consume real model tokens. Each run creates a fresh project and deletes it, its Runtime snapshots and its Supabase records in a `finally` block, whether tests pass or fail. The temporary `.e2e-results/project.json` is removed after successful cleanup; a separate `E2E_OUTPUT` isolates another deployment's state. The suite does not auto-top-up, publish, or edit other accounts. Cleanup is restricted to owned E2E projects belonging to provisioned test accounts and explicitly marked with an `e2eRunId` UUID at creation. Normal runtime idle pausing remains in effect.

For an interactive investigation, use a disposable test project and clean it up afterward. Before cleanup, submit “Change the heading to DreamForge E2E Counter and briefly explain what changed,” check visible progress and final text, click **Add one** twice, check the counter reads 2, click **Reset**, check 0, and reload to verify history. Save a screenshot. A browser test should be reported separately from the command results.

## Verified on 15 October 2026

The GLM browser smoke test passed on the production app in an isolated **E2E Prompting Playground** project: simple reply, visible request status, actual file edits, written completion, playable counter (0 → 2 → Reset → 0), persisted history after reload, and a local safety refusal with no new tools displayed. Workspace creation was noticeably slow before the chat became available. The counter build was complete when inspected roughly 36 seconds after submission; this is an observation bound, not an exact latency measurement.

The fast suite and runner's then-current three HTTP fixture cases (success, missing final text, provider stream error) passed. The standalone live API command could not run because a dedicated test login was not configured. Automatic provisioning was also unavailable because the deployed Supabase service-role key was empty. No credentials or wallet limits were changed. The browser pass used the existing signed-in session and a new test-only project; it did not edit the pre-existing project. It consumed approximately 7,099 internal tokens. Supply dedicated credentials before enabling scheduled/CI runs.

## Phase 1/2 rollout on 17 October 2026

The dedicated API login is now configured privately, with a finite 1M internal test allowance. Setup can use the ordinary signup API when Vercel deliberately hides its sensitive service key from local exports. The migration and protected runtime configuration are applied to production. Historical failures from live rollout are retained; fixes covered server-function browser packaging, valid snapshot names, restart initialization, starter compatibility, generated-cache compilation, and recovered-tool status reporting. The runner submits the current project revision and authenticates the protected preview entry. Production rendering and button evidence are revision-bound; inspect `/execution` to distinguish machine evidence from the learner's own acknowledgement.

The runner also covers providers reusing a text ID in later steps: a new `text-start` begins a separate text part, so preliminary narration is never mistaken for the persisted final answer.

Source listing excludes build and package caches (`.next`, `.npm`, `.cache`, `.pnpm-store`, `.yarn`) so Runtime output limits cannot hide app files behind cache entries.

The final public API suite and complete UI smoke passed on 17 October 2026. API build timing: first feedback 14.067s, first model text 20.342s, completion 38.777s. Full browser edit and visible final reply: 40.677s; actual preview clicks/reset and history after reload passed. For browser tests, wait for the preview's loading to settle, check each expected value, bound screenshots and cleanup, and use a unique visible completion marker instead of awaiting an SSE response's network-finished event indefinitely. Historical failure reports remain alongside the successful reports.


## Automatic cleanup (23 October 2026)

Every completed runner execution, including a failed assertion, deletes its project and snapshots through the authenticated `/api/projects/{id}/e2e` DELETE endpoint. It verifies the project disappears from the list, clears local project state, and retains the JSON test report. A cleanup failure marks the whole suite failed and retains the project ID for recovery. Startup reclaims earlier leftover playgrounds. The existing runtime maintenance cron also removes inactive E2E projects older than one hour if a killed process could not run its `finally` block. Running, unexpired tests cannot be deleted. Cleanup preserves ordinary projects, prepared starter snapshots and account token totals.

For a full live run on this Mac:

```bash
E2E_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e:prompting
```

Browser checks run before cleanup; afterward the report's project URL is historical. Do not run a separate browser check after the project has already been deleted.
