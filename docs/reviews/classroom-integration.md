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

## School workspace and platform monitoring (2026-11-01)

School-admin membership now selects the school workspace at `/home`, with shared studio routes for teachers, classrooms, students and safety. The legacy `/school` URL redirects home. School admins can invite teachers, create classrooms with a chosen lead teacher, add co-teachers and enroll existing school students. New students use the classroom signup code. Setup writes validate administrator membership and the school of every participant. Admins are not automatically assigned to teaching teams; prompt approval authority is unchanged.

The platform `/admin` backend now includes schools, teachers, students, classrooms, groups and the existing project showcase tools. Directories include independent accounts and support search and school filtering. Groups represent shared projects, with members and the current editor. Access remains restricted to the existing `platform_admins` table. A read-only database check confirmed `justinyek@gmail.com` / `jyek` is already a platform administrator.

Validation: 56 database tests, 152 unit tests and SDK simulations passed; production build passed. Standalone `tsc --noEmit` also includes test sources and reports existing errors in final-response, local-safety, schema-migration and terminal-input tests. No production data was changed, and this update has not been deployed or browser-tested against live accounts. Directories currently load all records server-side and show 50 at a time; server pagination should precede large-scale rollout.
