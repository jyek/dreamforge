# Student harness integration and safety

## Independent safety and login configuration

The current app runs directly on Vercel at https://dreamforge.vercel.app, with Supabase project/history storage and Freestyle coding VMs. `STUDENT_LOGIN_ENABLED=false` keeps the public demo account-free with no student token quotas. `SAFETY_ENABLED=true` independently enables the public safety path. Classroom mode always requires safety, even if that flag is false.

The anonymous demo uses local rules before OpenRouter, an under-13 safety system prompt, persisted/redacted server history, restricted student file tools, checks before code writes and incremental output screening. Completed text blocks and tool values are screened before release; transient fixed progress labels stream immediately and every eight seconds while waiting. Raw tool argument fragments and private reasoning never stream. Rules cover explicit exploitation, self-harm, real-world violence, targeted harassment, hate, instruction overrides, malicious-code requests and some privacy requests. Common games such as Snake and space shooters are allowed. The checks normalize Unicode compatibility forms and remove zero-width characters, but are not semantic moderation and can miss paraphrases or incorrectly block benign discussions.

Blocked inputs receive an automatic assistant reply without starting a model run. Only a placeholder for the blocked prompt enters conversation history, so a later safe request is not permanently blocked by that prior input. Redacted audit records live in `adorable.safety_events`, linked to a project VM ID with no invented student identity. Browser database roles cannot read or write them. This does not create an anonymous teacher-approval endpoint.

When safety is enabled, terminal input/output, repository imports and public publishing/rollback/domain changes are rejected server-side. Browsing projects and read-only code remain available. Existing public releases and legacy VM code are not retrospectively scanned or unpublished. VM egress restrictions, full artifact quarantine/scanning, active adult notifications and retention automation remain unfinished.

Classroom mode retains the independent semantic moderation adapter (`STUDENT_MODERATION_URL` and `STUDENT_MODERATION_KEY`) and approved-provider gate. Local rules do not replace that requirement or satisfy all requirements in the source document. Student ownership mapping and teacher review remain classroom features.

## Student authentication

The login form signs into the existing Dreamforge Supabase Auth project. There is no child signup form. Passwords go only from the browser to the server and then to Supabase Auth; access tokens live in an HttpOnly, SameSite=Strict cookie. Every protected API request verifies the token with Supabase, rather than trusting its claims or browser-selected roles. Sessions currently require signing in again after up to one hour; refresh and a Dreamforge one-time SSO handoff are future integration work.

A student must have an enrolled `students.user_id` record. Classroom owners are teachers; user-editable Auth metadata cannot confer teacher permissions. `harness_projects` maps each Supabase `projects.id` to its Freestyle VM ID. Students access only their own enrolled classroom projects. Assigned teachers can read their class's project conversations, but cannot use the student editing endpoint to impersonate them. Membership and class time windows are checked server-side.

## Token budgets

`token_budgets` stores per-user daily allowances; `token_runs` stores per-model-call input/output usage and reservations. The default is 200,000 total input plus output tokens per UTC day, configurable by the assigned teacher. This is a product quota, separate from OpenRouter's shared requests/day allowance.

Before **each model step**, a database transaction atomically reserves a conservative token estimate including history, tool messages, system prompt overhead and maximum output. Concurrent requests cannot spend the same balance. Actual reported usage replaces the reservation; settlement is idempotent. Missing usage or interrupted requests charge the full reservation conservatively. A crash can leave a reservation held until the next UTC day; reconciliation is still needed. Runs allow up to five model steps and 8,192 output tokens per step. Free models still consume token budgets when classroom mode is enabled.

Teacher APIs can set today's budget for an enrolled student, set future default class budgets, pause access and configure a class time window. The UI exposes class pause/resume, daily defaults, individual budgets and safety review. Session credit allocation and rollover described in the document remain future work; daily budgets do not implement rollover.

## Safety source

Source: https://docs.google.com/document/d/1ZaZx2-rHzxSKeOaPFHqn8PuqwVtwVnwLhJIn2x7-HxQ/edit?tab=t.m0a341swdsbj

Read on 2026-10-10. Policy version: `dreamforge-safety-2026-10-10-v1`. This implementation is a guarded integration foundation, not a certification of compliance or a complete moderation system.

| Source requirement | Implemented boundary | Remaining work |
| --- | --- | --- |
| Student identity never reaches AI | No account/roster identifiers in model requests; redact classroom aliases, email addresses, phone numbers and common credential patterns | Dedicated PII/entity detection for addresses, indirect identifiers and arbitrary names; evaluate against adversarial examples |
| Screen every input | Independent moderation adapter before model requests; missing service rejects request | Connect and validate school-controlled semantic moderation service |
| Screen every output | Buffer response before browser delivery; screen before saving; no reasoning exposed; screen generated source before writing it to VM | Evaluate classifier coverage; quarantine entire generated revisions, scan artifacts and previews, not just tool arguments |
| Allow / block / review | Persist decisions and categories; teacher queue; exact input-hash approvals last 24 hours | Notification delivery, escalation SLAs and incident response |
| Under-13 immutable protection | Strict age band for all learners; high/critical and sexual-minor classifications blocked; teachers cannot override prohibited decisions | Verified age bands, policy-version administration, nuanced age-appropriate teaching workflows |
| Malicious code protection | No unrestricted shell tool, terminal writes, repository imports or dependency changes; restrict source paths; reject symlinks and obvious system/network/secret access; sandbox preview iframe | AST/dependency scanning, immutable execution templates and VM egress restrictions; keyword screening is insufficient by itself |
| No training / strict retention by AI partner | `STUDENT_AI_PROVIDER_APPROVED=false` blocks model calls until school approves terms | Obtain contractual approval, configure permitted provider routing and retention policy; a `:free` suffix does not establish suitable privacy terms |
| Teacher control of access | Ownership checks, enrolled membership, pause and time-window settings | Class session schedule UI and school-wide role administration |
| Credit/session controls | Atomic daily token accounting, class defaults and individual teacher budgets | Session grants and rollover |
| Teacher-created child accounts | No child signup endpoint in this harness | Dreamforge currently has public signup UI; teacher provisioning and school consent flow must be implemented there before rollout |
| High-severity adult escalation | High-severity events retained in assigned teacher's queue | Active alerts, designated responsible adults and school incident workflow |

## Independent moderation service contract

Set `STUDENT_MODERATION_URL` and `STUDENT_MODERATION_KEY` to an approved service controlled by your platform. The adapter sends only redacted content, phase (`input`, `output`, `tool`), strict under-13 band and policy version; it never sends a user or project ID. The service must return validated JSON:

```json
{"decision":"allow","categories":[],"severity":"low","score":0.01}
```

Categories: `bullying`, `hate`, `self_harm`, `violence`, `sexual_minors`, `prompt_manipulation`, `malicious_code`, `privacy`. Unavailable service, invalid output or timeouts fail closed. The service must independently understand context and classify all document categories; regexes in this repo are additional code/identity checks, not semantic moderation.

A teacher can approve only an exact borderline input from their classroom. Approval cannot turn a prohibited block into allow. Outputs and generated code cannot be manually approved through the input review endpoint. Self-harm blocks use a supportive trusted-adult message.

## Storage and deployment

The five new plain-name tables have RLS enabled and no browser role permissions. Only server code writes budgets, VM mappings or safety approvals. PostgreSQL uses the provided session pooler and verifies TLS with the Supabase CA. Credentials remain in ignored `.env`.

The current Next.js backend uses Node, PostgreSQL TCP and Freestyle. ChatGPT Sites can host the public interface, but its Cloudflare Worker runtime cannot run this Node backend unchanged (raw TCP is unavailable). Keep the backend on AWS or a dedicated Freestyle VM, then expose a narrow HTTPS API. Vercel is optional. Restrict CORS to the Sites origin, keep provider credentials server-side, and add abuse controls before enabling unauthenticated generation. The public demo currently has no AI calls or quotas.

Publishing, rollback and public-domain changes are paused at the server boundary until revision-based teacher approval, artifact scanning and suitable production hosting are connected. The current upstream publisher uses a development server, so it is not the production classroom deployment implementation.

## Validation

`python3 tests/run-database-tests.py` launches disposable local PostgreSQL and validates concurrent quota reservations, idempotent settlement, conservative interrupted-call accounting, browser-role denial, identity redaction, obvious unsafe-code checks, unavailable-moderator denial and immutable critical blocks. TypeScript validation passes. Anonymous classroom API requests and cross-origin mutations were rejected. Real student login and end-to-end moderated generation still require classroom test accounts and an approved moderator/provider.
