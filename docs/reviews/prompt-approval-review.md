# Prompt approval verification — 1 November 2026

**Historical report:** the workflow below was replaced on 3 November 2026 by
[student-requested prompt approval](../e2e/prompting.md#student-requested-prompt-approval).
New flagged or blocked inputs no longer enter the approval queue automatically.

A student prompt is held automatically only when moderation returns `review` and the student currently belongs to a classroom. A `block` decision is never teacher-overridable. Classless students receive the ordinary safety response, with no approval hold. Existing direct teacher links do not qualify as classroom membership.

Either the current lead teacher or a current co-teacher of a classroom containing the student can approve or decline. School Admin access alone does not grant approval rights. Decisions are atomic; only the first decision wins. Approval is bound to the exact student, project, conversation and prompt, and consumed once. Current classroom/teacher membership is checked again before consumption.

## Changes

Restored reachable Approve / Don’t approve controls in each pending prompt’s Safety table row. The server supplies only classrooms in which the viewer actually teaches the student. Teacher home action links open Safety with the classroom filter. Held-prompt polling excludes classless students.

## Verification

- Deterministic prompting suite passed.
- All 62 isolated PostgreSQL database tests passed, including lead/co-teacher permissions, unrelated teacher denial, classless students with legacy teacher links, one-use approval, blocked prompt rejection, competing decisions, and removal from a classroom before approval consumption. Test database removed.
- TypeScript check passed. Final production webpack build passed, including the table wrapping adjustment.
- Browser walkthrough used the actual Assistant and TeacherPromptGuidance components with controlled local moderation/API fixtures. Verified student waiting state, teacher approve controls, reviewer attribution, automatic student continuation, and classless refusal without an approval state. Screenshots are explicitly labeled as a demonstration; they do not prove the real moderation provider returned `review` for the sample wording.
- Live API test passed login, disposable project creation/reopening and streamed read-only reply persistence (first feedback 14.6 s, first text 22.2 s, reply total 28.3 s). The coding step failed because the real safety provider could not finish. No repeated model retry was performed. Automatic cleanup passed and removed the disposable project and its snapshot. Full two-account live approval remains unverified.
- Corrected the browser E2E card selector to target the accessible Open project link after the clickable-card UI change.

## Live follow-up verification

The fixed local production build completed the real approval journey on 1 November 2026: semantic moderation returned review, no tools ran before approval, either classroom teacher was eligible, one co-teacher approved, a duplicate lead-teacher decision was rejected, and the approved prompt continued through real file changes to revision 8, compilation and a persisted final answer. Continuation first feedback was 2.219 s, first model text 90.292 s and stream completion 122.123 s. All disposable project/snapshot/classroom/teacher data was removed. Browser gameplay checks were not configured. The live runner used authenticated APIs for submission, approval and continuation; actual teacher Safety/student workspace pages were also inspected. Browser auto-resubmission remains covered by the separate controlled walkthrough.

Investigation confirmed intermittent upstream Groq 429 responses for the sole listed gpt-oss-safeguard-20b endpoint, with provider credit available. Initial live failures remain in the ignored reports. A final-output moderation path also re-screened teacher-approved student content. The server now records the exact consumed approval on that message and substitutes a neutral reference only for final output moderation. New student requests retain earlier intent in their input check; model answers and streamed tools remain screened. Untrusted browser approval metadata is discarded by chat-input reconstruction. Rejected moderation outcomes now record fixed diagnostic metadata in the execution events, separately from provider failures.

Regression checks: all 161 unit tests, deterministic prompting/provider checks, TypeScript and production build passed. No moderation model, privacy setting, existing role grant, wallet or environment variable was changed. The local Supabase service key rejected fixture provisioning; isolated temporary auth records were provisioned with explicit test markers through the database and deleted after normal login/approval testing.

### Browser follow-up

The student submitted the real flagged prompt through the browser. A co-teacher clicked Approve once in Safety, and the student's waiting conversation automatically polled and resubmitted the approved request without manual Send. The application completion checkpoint confirmed a completed run, revision 5, compilation passed and a persisted final assistant reply after 102.440 s. Actual decision, generated source and final response screenshots were saved. Gameplay/rendering interactions were not tested. The runner subsequently failed its separate 60-second screenshot-acknowledgement gate; the original failed report is retained alongside the successful application completion checkpoint. All disposable accounts, class, project and snapshot were removed. Student and teacher used separate browser sessions; submission/continuation ran on the production test build, while the teacher Safety UI ran on the live local development app against the same database.

CI also exposed an unrelated idle-socket race in the isolated legacy-wallet conversion test. Its one-connection fixture now uses a pg.Client and awaits actual socket closure before dropping its private database. All 62 database tests passed locally after this fixture fix.

### Preview CI rate-limit follow-up

The live journey at c80314d failed its first prompt after login, creation and reopening passed. Reproduction against that exact Vercel Preview confirmed `moderation.failed` with phase input, reason http_error and status 429 in the deployment logs. Cleanup removed the disposable project. This was provider availability, not a classroom approval regression.

Rejected HTTP 429 moderation requests now receive up to three retries (default 1, 2 and 4 second backoff), within the same existing 15-second abort deadline. A provider's long Retry-After still fails promptly instead of retrying early. Accepted generations, malformed decisions, transport errors and other HTTP statuses are not replayed. Safety still fails closed if capacity does not recover. The E2E runner now captures whitelisted moderation diagnostics before project cleanup; missing diagnostics cannot prevent cleanup or turn a failed run green. Regression coverage includes persistent rejection, deadline cancellation, privacy filtering and unavailable diagnostic endpoints.

The backoff CI run passed moderation, model edits, persisted replies, generated preview HTML, unsafe-prompt blocking, origin rejection and initial counter clicks. It then exposed a separate refresh-hydration race: the refresh test clicked SSR buttons before their client handlers loaded. Both initial and refreshed previews now share the existing network-idle readiness check before interaction, with explicit Reset → 0 → Add one → 1 assertions. A model-free browser regression holds the handler script and verifies that readiness waits for it on consecutive loads. The failed CI run and artifact remain retained; no application or safety assertion was weakened.
