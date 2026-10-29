begin;
set local lock_timeout='5s';
create table dreamforge.platform_admins (
 profile_id uuid primary key references dreamforge.profiles(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table dreamforge.platform_admins enable row level security;
revoke all on dreamforge.platform_admins from public,anon,authenticated;
create table dreamforge.admin_audit_log (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references dreamforge.profiles(id) on delete set null,
 action text not null,
 project_id text,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table dreamforge.admin_audit_log enable row level security;
revoke all on dreamforge.admin_audit_log from public,anon,authenticated;
create unique index showcase_source_copy on dreamforge.projects((metadata->>'showcaseSourceId'))
 where metadata->>'showcaseSourceId' is not null;
commit;
