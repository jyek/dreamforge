begin;
create table if not exists adorable.class_projects (
 class_id uuid not null references adorable.classes(id) on delete cascade,
 vm_id text not null references adorable.projects(vm_id) on delete cascade,
 assigned_by uuid not null references adorable.profiles(id),
 created_at timestamptz not null default now(),
 primary key(class_id,vm_id)
);
create index if not exists class_projects_vm_id on adorable.class_projects(vm_id);
alter table adorable.class_projects enable row level security;
revoke all on adorable.class_projects from public,anon,authenticated;
commit;
