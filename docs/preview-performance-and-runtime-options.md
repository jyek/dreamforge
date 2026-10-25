# Preview performance and Rust tooling assessment

Date: 18 October 2026. Scope: DreamForge's editor/preview loading path and the framework used by generated apps. Existing projects retain their current framework.

## Decision

Keep DreamForge's Next.js platform and existing Next.js projects. Optimize preview orchestration first. Consider a separate React/Vite starter for new projects only after a controlled comparison with OJ. No measured OJ-versus-DreamForge performance claim is made here.

OJ is development/build tooling written in Rust; adopting it would keep React/TypeScript application code. A full rewrite of DreamForge's server in Rust is a separate, much larger proposal, with little evidence of benefit for the observed bottleneck.

## Measured current problem

A dedicated E2E counter was loaded three times using production, the same authenticated browser context and a running VM. Each navigation waited for the heading, then tested Reset → 0, Add one → 1, Add one → 2, Reset → 0. No source edits, model requests or publishing were used for the baseline.

| Baseline run | Heading visible | Load plus successful counter checks |
| --- | ---: | ---: |
| 1 | 12.740 s | 24.128 s |
| 2 | 10.037 s | 29.032 s |
| 3 | 9.991 s | 39.263 s |

The second column is rendering, not proof of hydration. The third includes the browser's action/assertion overhead and is not a standard time-to-interactive metric. Three sequential smoke observations do not establish p95 or a statistically stable speedup. Individual asset requests took approximately 4.5–28.8 seconds in this sample. These requests were made after framework dependencies and the development server were already present.

The source explains a concrete contributor: `runtimePreview` called `prepareProjectRuntime` before checking saved preview credentials. The preparation path reads provider networking, fetches and refreshes VM state, takes a project-scoped database advisory lock, checks a marker file, and opens/detaches the named development-server session. HTML and each JS/CSS asset pass through that resolver. Concurrent assets therefore repeated control-plane work and competed for the same project lock. The runtime readiness endpoint also did overlapping checks.

## Implemented optimization

Saved preview credentials are now read before VM preparation. Valid credentials reuse the existing preview without provider networking/VM/session calls. The database is still consulted on each request, so recovery's binding update and `preview=null` invalidate the old endpoint without a worker-local stale cache. Near-expiry credentials and explicit refresh still prepare the runtime and reissue credentials.

The durable snapshot-in-progress guard runs before cached resolution, including asset requests. Entry authorization, project-scoped asset capabilities, opaque-origin CSP, response size bounds and identity separation remain enforced. The HTML entry retries preparation once for an unavailable upstream host (502/503/504); real app errors such as 404/500 are preserved. Asset requests do not independently trigger a repair storm. The runtime endpoint retains explicit wake/readiness handling. Existing 30-minute idle settings are unchanged.

Tests cover cached resolution with zero preparation calls, snapshots blocking wake, missing/expired/malformed credentials, explicit refresh, changed bindings, and bounded host recovery. Browser fixtures cover opaque-frame interactivity and real Next hydration. Production comparison results are appended after deployment.

## What Rust would and would not change

DreamForge's own Next.js 16 build already uses Turbopack. The dedicated generated project was also read back as Next.js `^15.5.2`, with `next dev --turbopack`. Turbopack is a Rust bundler integrated with Next.js; Rust is already present in this toolchain. [Next.js documentation](https://nextjs.org/docs/app/api-reference/turbopack)

OJ supports React/Vite-style projects and documents TanStack Start integration, with JavaScript hosting still involved for server rendering/plugins. Its README labels it experimental. The reviewed source was commit `b731b9725f81553bed9f69e353eac277a281bc03`; GitHub's release API reported v0.2.36, published 16 October 2026. [Pinned OJ source](https://github.com/lovablelabs/oj/tree/b731b9725f81553bed9f69e353eac277a281bc03), [release](https://github.com/lovablelabs/oj/releases/tag/v0.2.36)

OJ's published benchmark favors memory consistently; its experimental Vite bundled-mode comparison is faster on several startup/reload cases. Thus choosing an implementation language is not a performance result. Those measurements use a different machine/workload from DreamForge and cannot predict our end-to-end improvement. [Pinned benchmark](https://github.com/lovablelabs/oj/blob/b731b9725f81553bed9f69e353eac277a281bc03/README.md#benchmarks)

Lovable reports a production experiment with lower preview startup and acquisition times, but that also changes its sandbox image and orchestration. We cannot attribute the whole improvement to a compiler or apply its multiplier to DreamForge. [Lovable's rollout report](https://lovable.dev/en/blog/faster-previews-oj)

## Migration impact in this repository

| Area | Current assumption | Work needed for another frontend toolchain |
| --- | --- | --- |
| Platform | Next App Router, server rendering, cookies/auth, route handlers, streaming API routes | Keep this platform; replacing it is unrelated to generated-app previews |
| Generated starter and prompts | Next App Router, Tailwind, shadcn, `/workspace/app` | New versioned template and framework-specific instructions; imported repos need detection |
| Development server | `npm run dev -- --hostname 0.0.0.0`, named session, port 3000 | Adapter for command, binding flags, port, readiness and logs |
| Preview proxy | Next asset paths; protected HTTP proxy; iframe refreshed after coding | Vite/OJ module paths, transformed TSX, import URLs, source maps and an isolated authenticated WebSocket/HMR route |
| Verification | Next environment declarations, TypeScript checks and browser evidence | Framework-specific compiler setup; retain revision-bound browser/runtime/interaction checks |
| Publishing | Next static export/production build and release artifacts | Vite/OJ output/build adapter, asset base paths and SSR decisions; preserve fixed revision approvals and rollback |
| Recovery | Installed dependencies, command and framework inside a snapshot | Persist template/toolchain version so a recovered app launches the matching runtime |

Replacing `next dev` with `oj dev` would not supply the App Router/server-component behavior our projects expect. Compatibility should be proven with converted/new fixtures, rather than inferred from general React support. Existing projects should retain their framework unless explicitly converted.

## A useful pilot and its decision gates

Use separate disposable local fixtures or a dedicated test project, never a learner's app. Compare the same scorekeeper, a multi-screen app with images/Tailwind, and an app using a representative npm dependency. Pin versions and preload identical dependencies. Compare Next/Turbopack, Vite, and OJ on the same 2-vCPU/4-GiB Runtime machine, with both cold and warm caches.

Measure VM wake separately from server readiness, first HTML, hydrated button response, edit-to-paint, total process-tree memory, compilation errors/recovery, npm compatibility and static export. Check through the actual protected preview proxy, not just localhost. Include restart/snapshot recovery. More than three repetitions are required before claiming p95 or cost savings.

Suggested adoption gate for a new optional starter: at least 30% lower end-to-end cold preview time or enough verified memory reduction to use a smaller VM, with no regressions in the required interactions, recovery, npm support and sharing workflow. This is a proposed product threshold, not a measured outcome. Existing 4-GiB memory allocation remains billed at 4 GiB even if the server uses less; savings require safely reducing VM sizing after testing.

No OJ binary benchmark was performed: the local environment has no Rust/Cargo toolchain and the reviewed GitHub release offers no prebuilt binary assets. Published numbers are clearly separated from our measurements. Installing/building a development toolchain alone would not answer Next App Router compatibility or proxy behavior; the pilot must first provide a framework adapter and representative fixtures.


## Production comparison after the fix

Released to `dreamforge.vercel.app` as deployment `dpl_42ZaRWrqm2J1g5qjn854zhHh8Gir` (`adorable-v6n7uj6u1-jyek-projects.vercel.app`). Repeated the same browser script, project source and counter assertions. The initial navigation in each sample used a fresh authenticated browser context; later runs reused that context and reloaded the workspace. The scripts measure complete workspace navigation, including authentication/data loading and runtime readiness, rather than an isolated bundler benchmark.

| Optimized run | Heading visible | Load plus successful counter checks |
| --- | ---: | ---: |
| 1 | 5.470 s | 9.705 s |
| 2 | 4.282 s | 7.468 s |
| 3 | 4.500 s | 7.147 s |
| Median, before | 10.037 s | 29.032 s |
| Median, after | 4.500 s | 7.468 s |

In these observations, median heading time fell about 55% and the navigation-plus-counter-check time fell about 74%. All counter clicks/reset passed on every run. These are sequential, small-sample smoke measurements across two deployments; network/provider variance and cache state remain possible influences. The optimization removes a confirmed redundant code path, but these percentages are not a general performance guarantee or a measurement of OJ.

Reports: `.e2e-results/preview-baseline.json` and `.e2e-results/preview-optimized.json`; screenshot `.e2e-results/preview-optimized.png`. New resolver/recovery tests, policy/execution checks, prompting simulations, opaque-frame fixtures, real Next hydration and production build passed. Live coding regression results are appended when complete.

The remaining warm-load work includes runtime readiness calls, database round trips, proxying module requests and framework hydration. Cold VM wake was not separately benchmarked. A future optimization should measure these phases before selecting a new compiler. The current results support retaining Next.js and evaluating an optional new-project runtime only through a controlled pilot.

The final dedicated live API regression suite passed all seven checks after deployment: login, project, streamed/persisted reply, actual code edit and structured verification with final answer/history, generated preview, refusal before coding, and cross-origin rejection. Short reply timing: first feedback 495ms, first model text 2706ms, completion 2985ms. Coding timing: first feedback 394ms, first model text 18913ms, completion 32742ms. These model timings are separate smoke observations and are not the controlled preview comparison. All six production browser counter runs (three before and three after) exercised actual Add/Reset interactions; screenshots were visually inspected. The later API regression regenerated only the dedicated test counter, after the controlled comparison finished.

## Further wake and asset review — 18 October 2026

The next review found redundant repair/status/session calls, two database reads per proxied asset, duplicate project-list loading, and asset capability URLs changing on every HTML request. Changes combine the durable snapshot guard and saved preview lookup into one query; retain fresh binding reads so restored projects cannot reuse obsolete runtime credentials; resume memory without attaching the already-running server; probe immediately after repair; use an initial 250ms retry with backoff to 1500ms; and remove the duplicate project-list effect.

Asset capabilities now share a minute boundary and expire after 14–15 minutes. Successful asset responses use private, mandatory revalidation and an ETag derived from the actual rewritten response bytes. Every conditional request still validates the capability, checks the durable snapshot guard, and fetches current upstream bytes before returning 304. No shared CDN caching or stale development bundles are introduced. Native development-server conditional requests returned 200 despite their ETag, so the proxy computes its own validator instead of trusting native 304 support. HTML remains uncached.

The unchanged dedicated counter was exercised before these changes in the same authenticated browser context: warm headings 4.823s/3.042s, paused headings 4.098s/3.128s; complete navigation plus hydration and Add/Reset checks 8.574s/7.120s and 8.130s/6.947s respectively. Runtime readiness requests took 2.535s/1.238s warm and 2.249s/1.390s paused. These small samples include network variation and are not provider wake-only benchmarks. Reports: `.e2e-results/wake-baseline.json`.

Released the further changes as `dpl_37kUL4kUM9VrdtJsyVCwpdJWFdUp` (`adorable-avl8w0l9y-jyek-projects.vercel.app`), aliased to `dreamforge.vercel.app`. The temporary deployment browser run timed out because the configured preview points to the canonical domain, where that fresh browser had no session; preserved in `.e2e-results/wake-candidate.json`. The canonical browser run passed all four samples and actual counter interactions:

| Mode | Before: average heading | After: average heading | Before: navigation + hydration + button checks | After: navigation + hydration + button checks |
| --- | ---: | ---: | ---: | ---: |
| Warm, two samples | 3.933s | 3.588s | 7.847s | 8.021s |
| Paused, two samples | 3.613s | 2.999s | 7.539s | 7.387s |

The improvement to visible content is modest and full interaction time is effectively unchanged at this sample size. These observations do not establish a statistical speedup. Development modules/hydration remain a substantial part of preview load. Reports: `.e2e-results/wake-optimized.json`; screenshot `.e2e-results/wake-optimized.png` inspected. Explicit conditional asset requests returned 304 for unchanged bytes, 200 for a different validator, and 403 for an expired/tampered capability even with a validator.

A separate stopped-VM test passed: heading 27.989s and navigation plus actual counter checks 33.087s. Its three readiness requests took 10.907s, 10.653s and 3.810s. This is a true disk boot with lost server/compiler memory, materially different from idle pause/resume; no before measurement exists for that mode. The same project and disk were retained and successfully restarted. Report: `.e2e-results/wake-cold.json`. Reducing true cold starts will require preserving compiler state, reducing the preview bundle, or preparing a separate static/production preview after edits; switching the web host framework alone would not resolve this measured path.

Validation: 13 focused readiness/resolver/cache/access tests; the full 28-test safety/execution suite plus database checks; deterministic prompting regressions/provider simulations; local and Vercel production builds passed. Live prompting results follow after the browser measurements, to keep source changes outside the comparison.

Region inspection from current configuration and the dedicated runtime metadata found Vercel `icn1`, Supabase `ap-northeast-2`, and Runtime `us-east`. Thus the preview proxy currently spans Seoul and US East. This is a likely additional contributor, not an isolated region benchmark. Prefer a controlled comparison of preview-route placement and supported Runtime regions before moving global functions: moving all functions to US East could make the many Seoul database calls slower. The SDK accepts a create-time region, but no new region was selected and no existing project was migrated during this review.

The final live API suite passed all seven checks on the canonical production deployment. Read-only reply: first progress 535ms, first model text 2819ms, complete 3296ms. Coding: first progress 431ms, first model text 23778ms, complete 38421ms. These are model/backend smoke timings, separate from preview timings; visible progress is not model text. The refusal and cross-origin checks also passed. The suite edited only the dedicated E2E project after the before/after measurements.

A final read-only browser pass after the live model edit waited for frame hydration, clicked Add one twice, verified 2, clicked Reset, and verified 0. Passed; heading plus the frame hydration wait 6.809s and completed checks 6.968s in that separate observation (not part of the controlled before/after sample). Log: `.deployment/wake-final-browser.log`.
