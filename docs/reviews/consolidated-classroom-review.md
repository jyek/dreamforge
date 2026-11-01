# Consolidated classroom review — 1 November 2026

Scope: the combined `codex/classroom-actions` changes against current `origin/main`, plus the independent fixes proposed in #21. This review supersedes the older integration review as evidence for the final pull request. Applied database migrations were not rewritten, and no production data was changed during this review.

## Findings fixed

| Finding | Change | Regression evidence |
| --- | --- | --- |
| Project discovery trusted retained `project_members` rows after classroom or group membership ended. | One shared membership predicate now checks both students' school, classroom membership, and current named-group membership. Project lists, authorization, classroom links, group dialogs, and member names use it. Invalid editor assignments fall back to the owner. | Database checks remove the owner or peer from membership while deliberately retaining the old project-member row. The peer loses discovery, conversation links, and handover eligibility. |
| A valid group member could see only a classroom preview rather than entering the shared workspace. Shared projects were also absent from `/projects`. | Eligible classmates get workspace links and project cards. Assignment and metadata menus remain restricted to the owner. | Classroom data and dashboard tests check a member's conversation link and shared-project visibility, and deny the same access to another classmate. |
| Updating a different group could reset the current project's editor or fail because that unrelated project was busy. | Membership synchronization skips unchanged projects and retains a still-eligible editor. Changed memberships invalidate execution revisions and wait for active requests. | A project remains assigned to its current editor during another group's change, even with an active run. Moving its own member is refused while busy and succeeds when idle. |
| Removing classroom enrollment bypassed group execution guards. | Both directory and school setup removal use the same transaction and membership synchronization. | Removal rolls back while a group project is busy; once idle it removes sharing and returns editing control to the owner. |
| The classroom assignment API could detach the classroom backing an active named-group project. | The per-classroom removal path now enforces the same restriction as the project-sharing API. | Assignment removal is refused until the group relationship is removed. Removing a group preserves group-project status, classroom assignment and owner access, while revoking collaboration. |
| A prompt approval was bound to text and conversation, but not the project. Conversation IDs are unique only within a project. | Approval consumption and the student's held-prompt lookup now include project ID. Approval remains single-use. | A wrong-project attempt is refused; two concurrent consumption attempts produce exactly one success. Existing wrong-class, wrong-teacher, blocked-prompt and co-teacher tests remain in place. |
| Held prompts lost their wording; blocked/held flags were not shown immediately in the current chat. | Carried forward #21's text-preservation and streamed safety-status fixes. Held text remains visible to the student but is masked out of subsequent model history. Streamed status targets the browser's message ID. | Unit tests cover held/blocked persistence, dropped images, and moderation/history masking. |
| Existing standalone type errors made `tsc` unsuitable as a review gate. | Added the DOM async-iterable library and corrected test fixture/callback typing without weakening strict checking. | `npx tsc --noEmit`. |

Selected fixes from #21 were carried forward without replacing the newer classroom/card UI or changing the agreed handover rule: the current student editor can pass control; classroom staff can intervene. School Admin users keep their own Projects page and creation action, while school-scoped read permission remains available for inspecting work. #21's older school-wide directory UI and owner-takeover rule are superseded by the current workflow.

## Automated validation

- `npm run test:unit`: 159 unit tests plus SDK/provider simulations.
- `npm run test:database`: 62 checks in a fresh local PostgreSQL database, removed afterward.
- `npm run test:classroom-ui`: real React project components in an isolated Next app with mocked HTTP APIs. Covers click-away menus; conditional group actions; loading classroom choices before opening a dialog; classroom assignment; name/description persistence; outside-click dialog dismissal; group-status refresh; and whole-card navigation. Added to CI.
- `npx tsc --noEmit`: strict checking of application and test sources.
- Production webpack build in an isolated source copy, keeping localhost's development output intact.

The first regression fixtures were corrected to satisfy the existing required-email and username constraints. One earlier broad database run timed out in an existing browser-evidence check while a production build was also running; the complete 62-check rerun passed after separating those workloads. No test was skipped or weakened to obtain that pass.

## Remaining manual journeys

Use test accounts in two schools, not personal accounts:

1. Invite a teacher and student to a school, optionally assign a classroom, revoke an unused link, and confirm the revoked link cannot create an account. Verify a School Admin invitation grants school administration without granting classroom prompt approval automatically.
2. With two student sessions open, share an owner project with its classroom group, enter from the peer's classroom and Projects views, pass control, and refresh the receiving session. Only the current editor should write; another classmate and another school's accounts must be refused.
3. Repeat handover/member removal while an AI request is running. The operation should refuse without partly changing membership or control. Once idle, repeat successfully and verify old access is gone.
4. Submit a questionable prompt, approve it as a current classroom teacher, and verify it resumes once in the correct project. Repeat denial and a blocked request; blocked requests must never expose an approval action.
5. Check actual co-teacher email delivery with the configured provider. Automated email tests validate composition and failure handling, not external delivery.

Live multi-account approval/handover and external email delivery were not exercised in this review. The receiving editor still refreshes/reopens the project after handover. Large school directories still load server-side collections; server pagination remains a scaling improvement rather than a permission boundary.
