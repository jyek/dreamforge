-- Classroom organization is independent of project collaboration/edit permissions.
begin;
create table dreamforge.classroom_groups (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references dreamforge.classes(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 60),
 category text not null,
 created_at timestamptz not null default now(),
 unique(class_id,id)
);
create unique index classroom_group_names on dreamforge.classroom_groups(class_id,lower(name));
create table dreamforge.classroom_group_members (
 class_id uuid not null,
 child_id uuid not null,
 group_id uuid not null,
 primary key(class_id,child_id),
 foreign key(class_id,child_id) references dreamforge.class_members(class_id,child_id) on delete cascade,
 foreign key(class_id,group_id) references dreamforge.classroom_groups(class_id,id) on delete cascade
);
create index on dreamforge.classroom_group_members(group_id);
alter table dreamforge.classroom_groups enable row level security;
alter table dreamforge.classroom_group_members enable row level security;
revoke all on dreamforge.classroom_groups,dreamforge.classroom_group_members from public,anon,authenticated;
alter table dreamforge.projects add column classroom_group_id uuid references dreamforge.classroom_groups(id) on delete set null;
commit;
