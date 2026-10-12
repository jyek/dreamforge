# Dreamforge

Interactive teacher, student and school prototypes. No sign-in is required. Use the role switcher or direct URLs:

- `?role=teacher`: classrooms, student projects, course assignment and prompt review.
- `?role=student`: lessons, project studio, submission and teacher feedback.
- `?role=school`: people, classrooms, learning reports and sample safety preferences.

```bash
npm install
npm run dev
```

`npm run build` creates `dist/`. Sample edits are stored in `dreamforge-prototype-v1` in the browser. Reset sample data restores the examples. No prototype action reads or writes Supabase or sends invitations.

The Supabase-backed implementation is retained in `src/live-app.js` and `src/backend.js` for future activation; it is not imported by the prototype. The existing Supabase schema and security tests remain in `supabase/`.

### Expanded role prototype

- School A: 20 teachers, classroom/roster configuration, safety coverage and teacher-block counts, project/token reporting, sample subscription + usage billing, top-ups and classroom limits.
- Teacher: classroom and course creation, student configuration, shared teams, start/pause/stop, screen limits, broadcasts, voting, token reserves, prompt intervention, project verification review and messages.
- Student: personal/shared projects, class gallery, sample building, safety blocks, token alerts, verification → teacher approval → publishing → parent preview sharing, and teacher messages.

Use the top role switch to follow one flow across all three perspectives. Reset sample data restores the demo. All edits and approval records are browser-local; billing, moderation, generation, publishing and messaging are simulated. Seeded projects have shareable sample preview URLs; newly created projects do not transfer between browsers.

Validation: `node --test tests/prototype.test.js` and `npm run build`. Domain tests cover relationships, zero-cost safety blocks, budget enforcement, teacher intervention and version-specific publication approval.

## Coding studio

`studio/` contains the customized Adorable coding harness, based on the MIT-licensed [freestyle-sh/Adorable](https://github.com/freestyle-sh/Adorable) repository. Its upstream license is retained in `studio/LICENSE`. The Dreamforge dashboard at the repository root and the studio have separate package/deployment configurations.

The studio is live at https://dreamforge.vercel.app. It uses Next.js on Vercel, Supabase for project/conversation data, Freestyle for isolated coding workspaces, and OpenRouter for coding models. It includes independent public-demo safety checks, screened progress streaming, a model picker with Cohere-free-to-Qwen quota fallback, highlighted source views, VM inactivity handling, and static publishing support (gated while safety is enabled).

```bash
cd studio
npm ci
cp adorable/.env.example adorable/.env
# Configure private environment variables before starting.
npm run dev
```

For Vercel, use `studio/adorable` as the project root. See `studio/adorable/docs/vercel-deployment.md` and `studio/adorable/docs/student-harness.md` for deployment and safety implementation details. CLI maintenance scripts that refer to paths on the original developer machine must be adapted for your environment. The static game hosting worker is in `hosting/static-games/`. Local demo safety uses keyword rules; full semantic moderation and artifact scanning are not implemented.

Credentials, deployment receipts, VM data, generated builds and local screenshots are excluded from source control.
