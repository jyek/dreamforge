begin;
create table if not exists adorable.class_teachers (
 class_id uuid not null references adorable.classes(id) on delete cascade,
 teacher_id uuid not null references adorable.profiles(id) on delete cascade,
 added_by uuid not null references adorable.profiles(id),
 created_at timestamptz not null default now(),
 primary key(class_id,teacher_id)
);
create index if not exists class_teachers_teacher_id on adorable.class_teachers(teacher_id);
alter table adorable.class_teachers enable row level security;
revoke all on adorable.class_teachers from public,anon,authenticated;
alter table adorable.teacher_invites add column if not exists classroom_id uuid references adorable.classes(id) on delete cascade;
commit;
