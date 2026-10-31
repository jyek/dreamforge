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
- The consolidated school/hold/group migration was applied to production on 2026-11-01 at the owner’s explicit request; see `docs/school-roles.md`.
- Provision a dedicated school-administrator review account. The locally configured Supabase administrator credential returned HTTP 401 on 1 November 2026. No dedicated review account was created. The production schema migration was subsequently authorized and applied (see below).

This is an integration draft, not a production rollout approval.

## School workspace and platform monitoring (2026-11-01)

School-admin membership now selects the school workspace at `/home`, with shared studio routes for teachers, classrooms, students and safety. The legacy `/school` URL redirects home. School admins can invite teachers, create classrooms with a chosen lead teacher, add co-teachers and enroll existing school students. New students use the classroom signup code. Setup writes validate administrator membership and the school of every participant. Admins are not automatically assigned to teaching teams; prompt approval authority is unchanged.

The platform `/admin` backend now includes schools, teachers, students, classrooms, groups and the existing project showcase tools. Directories include independent accounts and support search and school filtering. Groups represent shared projects, with members and the current editor. Access remains restricted to the existing `platform_admins` table. A read-only database check confirmed `justinyek@gmail.com` / `jyek` is already a platform administrator.

Validation: 56 database tests, 152 unit tests and SDK simulations passed; production build passed. Standalone `tsc --noEmit` also includes test sources and reports existing errors in final-response, local-safety, schema-migration and terminal-input tests. No production data was changed, and this update has not been deployed or browser-tested against live accounts. Directories currently load all records server-side and show 50 at a time; server pagination should precede large-scale rollout.


## Production schema migration and role review (2026-11-01)

The owner authorized consolidating the three pending migrations and applying them to production Supabase without a backup. Applied `202611010000_school_roles_and_groups.sql` atomically; original account/classroom/project counts were unchanged. School-admin role grants are available, with no automatic promotions. The authenticated local student home page was refreshed successfully after migration, resolving the missing `school_admins` error.

Permission review tightened teacher access to current classrooms, added school-admin group management, restricted student group membership changes to staff, and fixed groups to one classroom. Group changes now serialize on project/execution locks, and changing editor/membership invalidates stale execution revisions. School and teacher classroom pages share the group management component. Production application deployment remains separate from the completed schema migration.

See `docs/school-roles.md` for the role matrix, migration process and account setup. Broad browser coverage of teacher approval and multi-user handover is still outstanding; database tests cover the role boundaries and execution-busy behavior.

Final validation for the role review: all 57 database tests, 152 unit tests and SDK simulations passed; production webpack build passed. The applied production migration checksum matches the repository SQL. Existing production account, classroom and project counts were unchanged.
