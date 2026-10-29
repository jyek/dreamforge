# Admin showcase

Visit `/admin` and sign in with an existing DreamForge account. A separate, server-owned `dreamforge.platform_admins` membership is required; being a teacher is not sufficient. Neither signup nor profile APIs can grant membership. Anonymous users and non-admins cannot call the admin APIs. Admin writes require a same-origin JSON request, and all responses disable caching.

The panel lists projects and owners, previews app pages without giving access to private conversations, and supports showing, hiding and ordering examples. Changes are recorded in `dreamforge.admin_audit_log`.

Selecting a personal project creates a fixed, read-only copy with a fresh empty conversation. The original remains private and editable. Source environments, hidden configuration/cache directories, Git history and conversations are excluded. Copying refuses active/unrecovered coding runs and captures files under the same project lock used by coding. A failed copy deletes its new VM/snapshot and never features the original. Later original edits do not automatically update the example. Hiding an example is reversible and does not delete files. Existing copies remain manageable if their source is later removed.

Apply `202610290000_admin_showcase.sql` before deployment. Grant/revoke admin membership only from a trusted server database connection. For example, after verifying the intended account:

```sql
insert into dreamforge.platform_admins(profile_id)
select id from dreamforge.profiles where username = 'verified_username'
on conflict do nothing;
```

The production administrator selected by the owner is `jyek`. Its teacher role and existing password are unchanged. The existing Space Explorer demo is linked to its original for management; no duplicate copy is created on first use.

Database tests cover admin/non-admin access, CSRF, browser-role denial, reversible selection, original ownership/chat preservation, copy reuse, ordering validation, orphaned copies and audit records. Browser fixtures exercise the real panel and login components without changing production accounts or examples.
