# Platform administration

Visit `/admin` and sign in with an existing DreamForge account. A separate, server-owned `dreamforge.platform_admins` membership is required; being a teacher is not sufficient. Signup and profile APIs cannot grant membership. Admin writes require a same-origin JSON request, and responses disable caching.

The `/admin` backend provides school management and monitoring directories for all teachers, students, classrooms and project groups, including independent accounts. People and classrooms can be searched and filtered by school. Groups are shared projects; the directory includes members and the current editor. Directory access is checked on the server using platform-admin membership before loading any records. The account `justinyek@gmail.com` (`jyek`) was verified as an existing platform administrator on 2026-11-01. No email-based authorization bypass is used.

School administrators are a separate school-scoped capability, stored in `school_admins`. Their normal workspace starts at `/home`, with `/teachers`, `/classrooms`, `/students`, and `/safety`. The old `/school` bookmark redirects to `/home`; there is no school-directory route for school administrators. They invite teachers, create classrooms with a lead teacher, assign co-teachers, enroll existing school students, and distribute classroom signup codes for new students. Setup operations verify both school membership and administrator membership. Creating a classroom does not add the administrator to its teaching team. Prompt approvals still require explicit classroom teaching membership.

The Projects tab lists projects and owners, previews app pages without opening private conversations, and supports showing, hiding and ordering examples. Changes are recorded in `dreamforge.admin_audit_log`.

Gallery visibility is a separate `projects.is_showcased` tag. Personal projects keep their owner, editing access and private conversations. Selecting one does not create a copy or turn it into an `is_example` project. Gallery links open `/showcase/<projectId>`, which serves only the live app preview anonymously. Conversations, source-file APIs, runtime control and the original editor still require their existing permissions. Edits to a showcased project update its public preview.

Public asset capabilities use a separate signature namespace. Hiding a project revokes new public HTML and asset requests, even if an asset capability has not expired. Removing a capability’s public prefix cannot convert it into a private workspace capability.

Apply the admin and live-showcase migrations before deployment. The live-showcase migration preserves the selection/order and links previously copied personal examples to their originals. Old copies are retained but no longer appear as duplicate gallery entries. The production administrator selected by the owner is `jyek`; its existing role and password are unchanged.

Grant/revoke admin membership only from a trusted server database connection, after verifying the intended account:

```sql
insert into dreamforge.platform_admins(profile_id)
select id from dreamforge.profiles where username = 'verified_username'
on conflict do nothing;
```

Database tests cover admin/non-admin access, CSRF, browser-role denial, reversible public tagging without changing ownership or chat, ordering, audit records and public access revocation. Browser fixtures exercise the real panel and login components without changing production accounts or examples.
