-- Group projects: several students can view one project, but only one edits.
-- projects.owner_id stays the creator. editor_id is who may edit right now
-- (null means the owner). Existing projects are unaffected.
begin;
set local lock_timeout='5s';
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
commit;
