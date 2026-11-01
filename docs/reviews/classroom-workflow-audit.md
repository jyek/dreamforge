# Classroom workflow audit — 1 November 2026

Scope: open DreamForge PRs #13–20, using combined PR #20 at fc3b141 as the initial review target. PR #20 incorporates the other feature branches; production main does not contain these features. The current PR20 branch subsequently received independent account-search and invite-layout changes.

## Results and fixes

| Requested workflow | Evidence | Result |
| --- | --- | --- |
| A student shares a project with their classroom group; members collaborate and the leader assigns an editor | Isolated PostgreSQL tests for sharing, current group membership, workspace conversation access, editor assignment, outsider denial, busy execution, and revoked membership; real component browser fixtures for sharing and editor changes | Fixed: the leader previously lost assignment authority after handing control away. Group members now get a workspace link in the classroom instead of only the preview. Stale project-member rows do not grant project-list visibility. |
| Safety-flagged prompts remain visible | Unit checks for original text, image removal, persisted flags and model-history masking; actual preview API safety refusal with saved history; real chat component browser fixture | Blocked prompts passed the live check. Fixed held prompts, which previously became a placeholder; they now retain their text with a distinct waiting label. Streamed safety status updates the current user message immediately. |
| Questionable prompts require teacher approval | Database checks for pending/approved/denied states, exact text/conversation binding, single-use approval, wrong-class/legacy-teacher rejection and co-teacher authority; browser safety queue fixture | Passed database and UI fixture checks. High/critical blocks are never approvable. School administration alone does not grant approval authority. |
| Lead teacher adds a co-teacher | Database checks for direct classroom enrollment, same-school invitations, acceptance and revocation; browser add-person fixture | Passed database and UI fixture checks. External email delivery was not exercised. |
| School admin sees teachers, students, classrooms and projects | Cross-school database permission checks; browser fixtures for all four directories and project search | Fixed missing school-wide Projects navigation. The list includes both teacher- and student-owned work and grants only school-scoped read access, including workspace project discovery. |

## Validation

- 155 unit checks plus SDK/provider simulations passed.
- 58 isolated PostgreSQL checks passed. Each fixture database was dropped afterward.
- Production webpack build passed.
- Browser fixtures used the actual React components, including the real chat transport and streamed safety-status event. Their HTTP responses were fixtures, not live classroom APIs.
- PR20 preview API journey at `dreamforge-adxoxo9nh-jyek-projects.vercel.app` passed student login, dedicated project creation/reload, streamed reply persistence, actual code edit and app check, saved final answer, generated preview, safety refusal before coding tools, and cross-origin rejection. The disposable project and its one snapshot were removed.
- Live reply: first feedback 534 ms; first text 2,239 ms; total 2,727 ms. Live edit: first feedback 542 ms; first text 2,710 ms; total 64,047 ms.
- An initial run mistakenly used main's older runner, whose safety assertion expected replacement text. It failed after passing the other checks and cleaned up. Inspection identified the obsolete assertion; the PR20 runner passed against the same preview. This was a harness mismatch, not evidence of a successful unsafe request.

## Remaining limits

No full live multi-account teacher/student approval handoff or simultaneous student editing session was run. No real invitation email was sent. Permission and transaction behavior were checked against isolated PostgreSQL; UI workflows were checked against fixtures. The successful live API run covered the original PR20 preview, not these follow-up fixes. No PR was merged, no production application was deployed, and no production classroom/account data was modified by this audit. Live prompting used only dedicated disposable playgrounds and consumed the configured test model/runtime allowance.
