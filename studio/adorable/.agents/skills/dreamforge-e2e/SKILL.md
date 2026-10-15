---
name: dreamforge-e2e
description: Test DreamForge prompting end to end, including streamed feedback, code edits, previews, persisted replies and safety blocking. Use for DreamForge smoke tests or diagnosing stalled coding runs.
---

Use the app at `/Users/justinyek/Code/dreamforge-source/studio/adorable` and its maintained instructions in `docs/e2e/prompting.md`.

Run `npm run test:prompting` for deterministic harness regression checks, then `npm run test:e2e:prompting` for live API integration. The live suite uses `.env.e2e.local`, records `.e2e-results/latest.json`, and only modifies its dedicated E2E Prompting Playground project. Keep credentials private; do not copy them into messages, reports or source control. Provision a dedicated student via `npm run test:e2e:setup` only if setup is needed and the requested environment is configured. Stop after the first live failure and inspect the report; do not hide failures with repeated model retries.

The command tests the real backend/model/runtime/database path, not browser interactions. For a full UI smoke test, use available browser-control tools to sign in with the dedicated test account, open the report's test project, submit a short edit, verify progress and final written reply, interact with the generated counter (Add one and Reset), reload and verify history. Follow the browser tool's supported APIs; do not extract cookies or browser internals. Save a screenshot as evidence. Avoid using a real student's project, changing their wallet or publishing the test app.

Report checks that passed and failed, first feedback/text and total duration from the JSON report, and whether browser interaction was actually tested. A visible progress heartbeat is not model text. HTTP 200 alone does not prove a playable app; tool output alone does not prove a completed reply. Live tests consume the configured model/runtime allowance. If credentials or capacity are unavailable, state the blocker instead of reporting the live test as passed.
