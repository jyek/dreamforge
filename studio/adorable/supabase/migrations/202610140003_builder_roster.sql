begin;
-- A class groups builders. Removing that group must not remove the teacher's
-- roster or access to those builders' projects, tokens and prompt reviews.
create table adorable.teacher_builders (
 teacher_id uuid not null references adorable.profiles(id) on delete cascade,
 child_id uuid not null references adorable.profiles(id) on delete cascade,
 added_at timestamptz not null default now(), primary key(teacher_id,child_id)
);
create index on adorable.teacher_builders(child_id);
insert into adorable.teacher_builders(teacher_id,child_id)
 select distinct c.teacher_id,m.child_id from adorable.classes c join adorable.class_members m on m.class_id=c.id;
create function adorable.record_teacher_builder() returns trigger language plpgsql as $$
begin
 insert into adorable.teacher_builders(teacher_id,child_id)
  select teacher_id,new.child_id from adorable.classes where id=new.class_id
  on conflict do nothing;
 return new;
end;
$$;
create trigger record_teacher_builder after insert on adorable.class_members
 for each row execute function adorable.record_teacher_builder();
alter table adorable.teacher_builders enable row level security;
revoke all on adorable.teacher_builders from public,anon,authenticated;
commit;
