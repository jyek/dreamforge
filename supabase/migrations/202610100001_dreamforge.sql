begin;
create table public.dreamforge_classrooms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 80),
 join_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 created_at timestamptz not null default now()
);
create table public.dreamforge_students (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.dreamforge_classrooms(id) on delete cascade,
 alias text not null check (length(trim(alias)) between 1 and 80),
 user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique (classroom_id,user_id)
);
create unique index dreamforge_unique_alias on public.dreamforge_students(classroom_id,lower(alias));
create index dreamforge_students_user on public.dreamforge_students(user_id);
create index dreamforge_classrooms_owner on public.dreamforge_classrooms(owner_id);
create table public.dreamforge_courses (
 id integer primary key,
 title text not null,
 description text not null,
 audience text not null,
 lesson_count integer not null,
 kind text not null check (kind in ('AI','Python'))
);
insert into public.dreamforge_courses values
 (0,'Build Apps with AI','Design, prompt, test and explain a working app.','6–12',5,'AI'),
 (1,'Creative Python 1','Create pixel art, colors and animations on an 8 × 8 display.','3–5',13,'Python'),
 (2,'Creative Python 2','Bring your designs to life with loops, functions and conditions.','6–8',12,'Python'),
 (3,'AI for Educators','Build your first classroom tool and guide responsible AI use.','Educators',3,'AI');
create table public.dreamforge_assignments (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.dreamforge_classrooms(id) on delete cascade,
 course_id integer not null references public.dreamforge_courses(id),
 created_at timestamptz not null default now(),
 unique (classroom_id,course_id)
);
create table public.dreamforge_projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 classroom_id uuid references public.dreamforge_classrooms(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 80),
 kind text not null check (kind in ('ai','python')),
 created_at timestamptz not null default now()
);
create index dreamforge_projects_owner on public.dreamforge_projects(owner_id);
create index dreamforge_projects_classroom on public.dreamforge_projects(classroom_id);
create table public.dreamforge_prompts (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.dreamforge_projects(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 content text not null check (length(trim(content)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index dreamforge_prompts_project on public.dreamforge_prompts(project_id,created_at);
create index dreamforge_prompts_author on public.dreamforge_prompts(author_id);

create function public.dreamforge_owns_classroom(class_id uuid) returns boolean
 language sql stable security definer set search_path = public, pg_temp
 as $$ select exists(select 1 from public.dreamforge_classrooms where id=class_id and owner_id=auth.uid()); $$;
create function public.dreamforge_in_classroom(class_id uuid) returns boolean
 language sql stable security definer set search_path = public, pg_temp
 as $$ select public.dreamforge_owns_classroom(class_id) or exists(select 1 from public.dreamforge_students where classroom_id=class_id and user_id=auth.uid()); $$;
create function public.dreamforge_reads_project(project uuid) returns boolean
 language sql stable security definer set search_path = public, pg_temp
 as $$ select exists(select 1 from public.dreamforge_projects where id=project and (owner_id=auth.uid() or public.dreamforge_owns_classroom(classroom_id))); $$;

alter table public.dreamforge_classrooms enable row level security;
alter table public.dreamforge_students enable row level security;
alter table public.dreamforge_courses enable row level security;
alter table public.dreamforge_assignments enable row level security;
alter table public.dreamforge_projects enable row level security;
alter table public.dreamforge_prompts enable row level security;
create policy classrooms_read on public.dreamforge_classrooms for select to authenticated using(public.dreamforge_in_classroom(id));
create policy students_read on public.dreamforge_students for select to authenticated using(user_id=auth.uid() or public.dreamforge_owns_classroom(classroom_id));
create policy courses_read on public.dreamforge_courses for select to anon,authenticated using(true);
create policy assignments_read on public.dreamforge_assignments for select to authenticated using(public.dreamforge_in_classroom(classroom_id));
create policy assignments_insert on public.dreamforge_assignments for insert to authenticated with check(public.dreamforge_owns_classroom(classroom_id));
create policy projects_read on public.dreamforge_projects for select to authenticated using(owner_id=auth.uid() or public.dreamforge_owns_classroom(classroom_id));
create policy projects_insert on public.dreamforge_projects for insert to authenticated with check(owner_id=auth.uid() and (classroom_id is null or public.dreamforge_in_classroom(classroom_id)));
create policy prompts_read on public.dreamforge_prompts for select to authenticated using(public.dreamforge_reads_project(project_id));
create policy prompts_insert on public.dreamforge_prompts for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.dreamforge_projects where id=project_id and owner_id=auth.uid()));

-- Atomic roster creation: avoids partially saved classes and duplicate aliases.
create function public.dreamforge_create_classroom(class_name text, aliases text[]) returns uuid
 language plpgsql security definer set search_path = public, pg_temp as $$
 declare class_id uuid; cleaned text[];
 begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(class_name)) not between 1 and 80 then raise exception 'Classroom name must be 1–80 characters'; end if;
 select array_agg(trim(x)) into cleaned from unnest(aliases) x where trim(x)<>'';
 if coalesce(cardinality(cleaned),0) not between 1 and 200 then raise exception 'Add 1–200 student aliases'; end if;
 if exists(select 1 from unnest(cleaned) x where length(x)>80) then raise exception 'Aliases must be at most 80 characters'; end if;
 if (select count(distinct lower(x)) from unnest(cleaned) x)<>cardinality(cleaned) then raise exception 'Use unique student aliases'; end if;
 insert into public.dreamforge_classrooms(owner_id,name) values(auth.uid(),trim(class_name)) returning id into class_id;
 insert into public.dreamforge_students(classroom_id,alias) select class_id,x from unnest(cleaned) x;
 return class_id;
 end; $$;
-- An alias is an invitation slot. Claim it with a signed-in account and the class code.
create function public.dreamforge_join_classroom(code text, student_alias text) returns uuid
 language plpgsql security definer set search_path = public, pg_temp as $$
 declare class_id uuid; slot_id uuid; slot_user uuid;
 begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select c.id into class_id from public.dreamforge_classrooms c where c.join_code=upper(trim(code));
 if class_id is null then raise exception 'Check your class code and alias'; end if;
 if exists(select 1 from public.dreamforge_students where classroom_id=class_id and user_id=auth.uid()) then return class_id; end if;
 select id,user_id into slot_id,slot_user from public.dreamforge_students where classroom_id=class_id and lower(alias)=lower(trim(student_alias)) for update;
 if slot_id is null or slot_user is not null then raise exception 'Check your class code and alias, or ask your teacher'; end if;
 update public.dreamforge_students set user_id=auth.uid() where id=slot_id;
 return class_id;
 end; $$;

-- Explicit grants keep anonymous visitors out of private records.
revoke all on public.dreamforge_classrooms,public.dreamforge_students,public.dreamforge_assignments,public.dreamforge_projects,public.dreamforge_prompts from anon,authenticated;
grant select on public.dreamforge_classrooms,public.dreamforge_students to authenticated;
grant select,insert on public.dreamforge_assignments,public.dreamforge_projects,public.dreamforge_prompts to authenticated;
revoke all on public.dreamforge_courses from anon,authenticated;
grant select on public.dreamforge_courses to anon,authenticated;
revoke all on function public.dreamforge_owns_classroom(uuid),public.dreamforge_in_classroom(uuid),public.dreamforge_reads_project(uuid),public.dreamforge_create_classroom(text,text[]),public.dreamforge_join_classroom(text,text) from public,anon;
grant execute on function public.dreamforge_owns_classroom(uuid),public.dreamforge_in_classroom(uuid),public.dreamforge_reads_project(uuid),public.dreamforge_create_classroom(text,text[]),public.dreamforge_join_classroom(text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
