create table if not exists adorable.project_classrooms (
 vm_id text not null references adorable.projects(vm_id) on delete cascade,
 class_id uuid not null references adorable.classes(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(vm_id,class_id)
);
create index if not exists project_classrooms_class_id_idx on adorable.project_classrooms(class_id);
alter table adorable.project_classrooms enable row level security;
