# Dreamforge technical specification

Current public experience: three role prototypes (teacher, student, school), selected with `?role=teacher`, `?role=student` or `?role=school`. No authentication is required. Sample state is shared between role views within one browser and persisted under `dreamforge-prototype-v1`. Prototype actions do not use Supabase. Teacher feedback, student submission, classroom assignment, school invitations, reports and safety preferences are simulated for UI review.

The prior cloud implementation is retained in `src/live-app.js` and `src/backend.js`, but is not part of the running prototype. The section below records the completed backend setup for future activation.

Implemented: Vite browser app with Supabase Auth and Postgres persistence. The browser uses the public publishable key and each signed-in user’s JWT; RLS enforces classroom/project access. Sidebar preference alone stays in localStorage. AI generation, automated moderation, credit accounting and Python execution remain unimplemented.

Applied schema: `supabase/migrations/202610100001_dreamforge.sql`. Database verification: `supabase/tests/access-controls.sql` uses rollback-only fixtures. Current tables are `dreamforge_classrooms`, `dreamforge_students`, `dreamforge_projects`, `dreamforge_prompts`, `dreamforge_courses`, and `dreamforge_assignments`. Student aliases are invitation slots claimed by authenticated users with a class code. Teachers read classroom projects; students read their own projects. Prompts are append-only for clients. Account labels (teacher/student) customize the UI; database authorization always depends on ownership/membership, never user-editable metadata.

Authentication: email/password sign-in, email-confirmed signup and sign-out. Public signup needs custom SMTP in Supabase; existing confirmed accounts work immediately. Auth site URL points to the public Sites URL. Data refreshes after writes, on focus, and every 30 seconds while idle; this is polling, not Realtime. Data reads paginate in batches of 1,000. Legacy browser-only projects are not automatically uploaded.

The following sections describe the future generation architecture.

## Architecture

Browser → authenticated API → Postgres + job queue → moderation → builder adapter → isolated preview.

Recommended implementation: TypeScript frontend, Supabase Auth/Postgres with row-level security, and a Node worker for long-running builds. Stream job status to the studio and prompt events to the teacher monitor. Generated code runs on a separate origin in a restricted iframe, never inside the teacher application.

## Data model

- `organizations`, `users`: organization membership and teacher/student roles.
- `classrooms`, `memberships`: teacher owner, hashed join code, student alias, budget.
- `courses`, `lessons`, `assignments`: curriculum and classroom assignments.
- `projects`: owner, classroom, tool, provider project ID, preview URL, status.
- `prompts`: author, project, immutable text, timestamp, moderation status/reason.
- `build_jobs`: prompt, idempotency key, provider job ID, attempts, status, error.
- `credit_ledger`: reservations, settlement and refunds per job.

## API contracts

| Endpoint | Behavior |
| --- | --- |
| `POST /classrooms` | Create classroom and bulk student aliases atomically; reject duplicates |
| `POST /classrooms/join` | Verify code plus issued credential; create scoped student session |
| `POST /assignments` | Assign authorized course to teacher-owned classroom |
| `POST /projects` | Create project for authenticated owner |
| `POST /projects/:id/prompts` | Validate, persist, reserve credits and enqueue; return prompt/job IDs |
| `GET /projects/:id` | Authorized project and paginated message history |
| `GET /jobs/:id` | Queued, screening, building, ready, blocked or failed |
| `GET /classrooms/:id/prompts` | Teacher-only, paginated audit feed |

## Builder boundary

`BuilderAdapter.createProject(prompt)`, `sendPrompt(projectId, prompt)`, `getBuild(jobId)` return normalized project IDs, status and preview URLs. Start with a deterministic mock adapter.

Lovable’s documented MCP supports project creation and messaging through OAuth. A hosted MCP client requires Lovable callback approval; validate permitted use, account isolation and commercial terms before choosing it. Its public REST API does not document general consumer signup or prompt-history endpoints. Keep student identity in Dreamforge and capture prompts here before forwarding. Never depend on reading another user’s private Lovable account.

## Controls and verification

Enforce organization/classroom ownership on every query. Keep provider credentials server-side. Rate-limit joining and prompting; hash student credentials. Screen inputs before forwarding, restrict preview network access, and require teacher approval before public publication. Record audit events without exposing student data to unrelated classrooms.

Test: tenant isolation; rejected duplicate aliases; blocked prompts never forwarded; idempotent retries/credit settlement; provider failures; preview sandbox escapes. The local scaffold verifies navigation, classroom creation, assignment, prompt recording and persistence only.

Provider basis: [Lovable API](https://docs.lovable.dev/integrations/lovable-api), [MCP server](https://docs.lovable.dev/integrations/lovable-mcp-server), [SCIM](https://docs.lovable.dev/features/business/scim). Documentation reviewed 10 October 2026; production integration is unimplemented.
