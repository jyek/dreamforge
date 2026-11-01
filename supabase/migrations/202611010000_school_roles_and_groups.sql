-- Consolidated classroom permissions, school roles, prompt holds and group projects.
-- School administration is a scoped role grant, independent of classroom teaching.
-- Existing teacher/child profile types remain compatible with deployed clients.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Questionable prompts can be held for the student's teacher to approve.
-- Only moderation "review" outcomes are held; blocked prompts are never approvable.
alter table dreamforge.prompt_reviews
 add column hold_status text check(hold_status in ('pending','approved','denied')),
 add column held_prompt_used_at timestamptz;
create index prompt_reviews_pending_hold on dreamforge.prompt_reviews(child_id,created_at) where hold_status='pending';
-- Browser roles already have no access to prompt_reviews (see the baseline).

-- Schools. A school admin is a teacher account that also administers a school
-- (same pattern as platform_admins). Existing accounts keep school_id null and
-- continue to work as independent teachers and students.
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

-- Group projects: several students can view one project, but only one edits.
-- projects.owner_id stays the creator. editor_id is who may edit right now
-- (null means the owner). Existing projects are unaffected.
create table dreamforge.project_members (
 vm_id text not null references dreamforge.projects(vm_id) on delete cascade,
 child_id uuid not null references dreamforge.profiles(id) on delete cascade,
 added_by uuid references dreamforge.profiles(id) on delete set null,
 added_at timestamptz not null default now(),
 primary key(vm_id,child_id)
);
create index on dreamforge.project_members(child_id);
alter table dreamforge.projects add column editor_id uuid references dreamforge.profiles(id) on delete set null;
alter table dreamforge.project_members enable row level security;
revoke all on dreamforge.project_members from public,anon,authenticated;

-- A group belongs to a single classroom; prevent deleting that scope underneath it.
alter table dreamforge.projects add column group_class_id uuid references dreamforge.classes(id);
create index projects_group_class on dreamforge.projects(group_class_id) where group_class_id is not null;
-- An administrator must belong to the school they administer. One school per account.
alter table dreamforge.profiles add constraint profiles_id_school_unique unique(id,school_id);
alter table dreamforge.school_admins add constraint school_admin_account_school
 foreign key(profile_id,school_id) references dreamforge.profiles(id,school_id) on delete cascade;
create unique index school_admin_one_school on dreamforge.school_admins(profile_id);
comment on table dreamforge.school_admins is 'School-scoped administrator role. Does not grant classroom teaching or prompt-approval authority.';
-- A server-only role directory makes scoped role grants explicit without changing
-- the profile types consumed by the currently deployed application.
create view dreamforge.account_roles as
 select id as profile_id, case when role='child' then 'student' else 'teacher' end as role, school_id from dreamforge.profiles
 union all select profile_id, 'school_admin', school_id from dreamforge.school_admins
 union all select profile_id, 'platform_admin', null::uuid from dreamforge.platform_admins;
revoke all on dreamforge.account_roles from public,anon,authenticated;
commit;
