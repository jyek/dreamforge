# Classroom integration review

Integrates open PRs #13, #14, #16, #17, #18 and #19. PR #15's moderation outcome handling is covered by #17; applying both independently would duplicate the path.

Changes made during integration:
- Preserve blocked-message flags while keeping held prompts distinct.
- Require an explicit classroom on approval/denial. The acting teacher must currently own or co-teach that classroom, and the student must currently belong to it. A teacher_builders relationship alone is insufficient. School administrator status does not grant approval rights.
- Hold requests only when the student currently belongs to a classroom.
- Add a home summary linking teachers to their classroom safety/action queues.
- Hide group member details from viewers not authorized to see the group dialog.

Validation: 151 unit tests and provider simulations passed before the final permission changes; webpack production build passed; isolated database suites passed 56 checks before the extra permission regression. Targeted group, school and prompt-hold suites then passed, including legacy-teacher rejection, wrong-class rejection and co-teacher approval.

Outstanding before rollout:
- Complete combined browser journeys, including teacher/student approval, school signup, email delivery and multi-student editor changes.
- Review group mutation concurrency and authorization across in-flight requests before treating one-editor guarantees as fully verified.
- Review whether prompts need a persisted originating classroom. Current project data permits students in multiple classrooms; current approval policy permits a current teacher of any classroom containing that student, but requires the chosen classroom explicitly.
- Apply additive school, prompt-hold and group migrations to the chosen review environment before using its login flows.
- Provision a dedicated school-administrator review account. The locally configured Supabase administrator credential returned HTTP 401 on 1 November 2026. No account or production migration was created.

This is an integration draft, not a production rollout approval.
