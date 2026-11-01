# Prompt approval verification — 1 November 2026

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
