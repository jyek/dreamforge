-- Schools. A school admin is a teacher account that also administers a school
-- (same pattern as platform_admins). Existing accounts keep school_id null and
-- continue to work as independent teachers and students.
begin;
set local lock_timeout='5s';
create table dreamforge.schools (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 120),
 created_at timestamptz not null default now()
);
create table dreamforge.school_admins (
 school_id uuid not null references dreamforge.schools(id) on delete cascade,
 profile_id uuid not null references dreamforge.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(school_id,profile_id)
);
create index on dreamforge.school_admins(profile_id);
alter table dreamforge.profiles add column school_id uuid references dreamforge.schools(id);
create index on dreamforge.profiles(school_id);
-- A teacher invitation can place the new teacher in a school, and optionally make them its admin.
alter table dreamforge.teacher_invites
 add column school_id uuid references dreamforge.schools(id),
 add column make_admin boolean not null default false check(not make_admin or school_id is not null);
alter table dreamforge.schools enable row level security;
alter table dreamforge.school_admins enable row level security;
revoke all on dreamforge.schools, dreamforge.school_admins from public,anon,authenticated;
commit;
