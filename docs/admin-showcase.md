# Admin showcase

Visit `/admin` and sign in with an existing DreamForge account. A separate, server-owned `dreamforge.platform_admins` membership is required; being a teacher is not sufficient. Signup and profile APIs cannot grant membership. Admin writes require a same-origin JSON request, and responses disable caching.

The panel lists projects and owners, previews app pages without opening private conversations, and supports showing, hiding and ordering examples. Changes are recorded in `dreamforge.admin_audit_log`.

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
