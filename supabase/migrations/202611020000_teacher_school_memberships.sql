-- Teachers may teach in multiple schools. profiles.school_id remains their
-- default school; joining another school never moves their existing classrooms.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create table dreamforge.school_teachers (
 school_id uuid not null references dreamforge.schools(id) on delete cascade,
 teacher_id uuid not null references dreamforge.profiles(id) on delete cascade,
 added_by uuid references dreamforge.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(school_id,teacher_id)
);
create index on dreamforge.school_teachers(teacher_id);
alter table dreamforge.school_teachers enable row level security;
revoke all on dreamforge.school_teachers from public,anon,authenticated;

insert into dreamforge.school_teachers(school_id,teacher_id)
 select school_id,id from dreamforge.profiles where role='teacher' and school_id is not null;

alter table dreamforge.classes add column school_id uuid references dreamforge.schools(id);
update dreamforge.classes c set school_id=p.school_id from dreamforge.profiles p where p.id=c.teacher_id;
create index on dreamforge.classes(school_id);
insert into dreamforge.school_teachers(school_id,teacher_id)
 select c.school_id,t.teacher_id from dreamforge.class_teachers t join dreamforge.classes c on c.id=t.class_id
 where c.school_id is not null on conflict do nothing;

-- Preserve the default-school membership for signup and existing integrations.
create function dreamforge.sync_teacher_default_school() returns trigger
 language plpgsql set search_path=dreamforge,pg_temp as $$
begin
 if new.role='teacher' and new.school_id is not null then
  insert into school_teachers(school_id,teacher_id) values(new.school_id,new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger sync_teacher_default_school after insert or update of school_id,role on dreamforge.profiles
 for each row execute function dreamforge.sync_teacher_default_school();

-- Older clients omit school_id when creating a classroom; use the default once.
-- An explicitly chosen school requires an existing teacher membership.
create function dreamforge.set_classroom_school() returns trigger
 language plpgsql set search_path=dreamforge,pg_temp as $$
begin
 if tg_op='INSERT' and new.school_id is null then
  select school_id into new.school_id from profiles where id=new.teacher_id;
 end if;
 if new.school_id is not null and not exists(
  select 1 from school_teachers where school_id=new.school_id and teacher_id=new.teacher_id
 ) then
  raise exception 'The lead teacher must belong to the classroom school';
 end if;
 return new;
end $$;
create trigger set_classroom_school before insert or update of teacher_id,school_id on dreamforge.classes
 for each row execute function dreamforge.set_classroom_school();

create or replace view dreamforge.account_roles as
 select id as profile_id,case when role='child' then 'student' else 'teacher' end as role,school_id
 from dreamforge.profiles p where role='child' or not exists(select 1 from dreamforge.school_teachers t where t.teacher_id=p.id)
 union all select teacher_id,'teacher',school_id from dreamforge.school_teachers
 union all select profile_id,'school_admin',school_id from dreamforge.school_admins
 union all select profile_id,'platform_admin',null::uuid from dreamforge.platform_admins;
revoke all on dreamforge.account_roles from public,anon,authenticated;
comment on table dreamforge.school_teachers is 'Server-managed teacher school memberships. Does not grant school administration or classroom access.';
comment on column dreamforge.classes.school_id is 'Stable school scope, independent of the lead teacher default school.';
commit;
