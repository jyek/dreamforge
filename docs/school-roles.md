# School and classroom roles

Role grants are explicit and can overlap. `profiles.role` retains the existing teacher/child account type for compatibility; `school_admins` grants school administration, and `platform_admins` grants platform administration. The server-only `account_roles` view exposes these as `teacher`, `student`, `school_admin`, and `platform_admin`. School-admin grants reference the account's own school and are limited to one school per account. Neither signing up as a teacher nor having platform-admin access automatically makes someone a school administrator.

| Role | Scope | Capabilities |
| --- | --- | --- |
| Platform administrator | Whole platform | Manage schools, issue the first school-admin invitation, monitor people, classrooms and shared projects. |
| School administrator | Assigned school | Invite teachers/admins, create classrooms and assign teachers, enroll students, manage classroom project groups, inspect flagged/blocked prompts and teacher decisions. |
| Classroom teacher | Classes they currently own or co-teach | Manage classrooms and student work, assign project groups, approve/decline held review prompts, inspect unsafe prompts. |
| Student | Enrolled classrooms and authorized projects | Join classrooms, create individual projects, view shared group projects and edit while holding control, pass control to another group member. |

School administration alone never authorizes prompt approval. An administrator who also explicitly teaches a classroom may act through that teaching role. Blocked prompts cannot be approved; only pending moderation-review prompts can be approved or declined. Approval requires a current classroom and student membership. Legacy `teacher_builders` records no longer grant current student access.

Groups are attached to a student's project and fixed to one classroom on the first member assignment. Staff manage membership; students cannot add classmates themselves. The existing owner retains ownership. A member can leave, and the current editor can pass control. School administrators and current classroom teachers can change the editor. Membership and editor changes lock the project and its execution state; active execution prevents editor changes, and control changes invalidate stale execution revisions. Students removed from classroom membership lose group-project access.

## Migration

`202611010000_school_roles_and_groups.sql` replaces the three unapplied October 31 branch migrations. It adds prompt holds, schools, school-admin assignments, school-aware invitations, project membership, classroom scope for groups, and the role directory in one transaction. It does not promote existing users, create schools, or delete existing application records.

Production Supabase was migrated on 2026-11-01 using `scripts/migrate-school-roles.mjs --env-file=<private-production-env> --apply`, without a backup as explicitly requested. The runner verifies that the original pending migrations are absent, uses a transaction and bounded lock timeout, checks existing record counts, and records the applied SQL checksum in the server-only `dreamforge.migration_history` table. Re-running with the same checksum is a no-op; partially migrated environments require separate review. Do not rewrite the applied migration.

The existing platform administrator can create a school in `/admin` and issue its first administrator invitation. Accepting that invitation grants the school-admin role. No school-administrator account was created by the migration.
