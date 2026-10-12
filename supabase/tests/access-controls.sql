-- Run as postgres in the SQL editor. Fixtures and test writes roll back.
begin;
insert into auth.users(id,email) values
 ('da1ef000-0000-4000-8000-000000000001','teacher-test@dreamforge.invalid'),
 ('da1ef000-0000-4000-8000-000000000002','student-test@dreamforge.invalid'),
 ('da1ef000-0000-4000-8000-000000000003','outsider-test@dreamforge.invalid'),
 ('da1ef000-0000-4000-8000-000000000004','peer-test@dreamforge.invalid');
insert into public.dreamforge_classrooms(id,owner_id,name,join_code) values
 ('da1ef000-0000-4000-8000-000000000010','da1ef000-0000-4000-8000-000000000001','Access test','TESTDREAM123');
insert into public.dreamforge_students(classroom_id,alias) values('da1ef000-0000-4000-8000-000000000010','Learner A');
insert into public.dreamforge_students(classroom_id,alias,user_id) values('da1ef000-0000-4000-8000-000000000010','Learner B','da1ef000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','da1ef000-0000-4000-8000-000000000002',true);
select public.dreamforge_join_classroom('TESTDREAM123','Learner A');
insert into public.dreamforge_projects(id,owner_id,classroom_id,title,kind) values
 ('da1ef000-0000-4000-8000-000000000020','da1ef000-0000-4000-8000-000000000002','da1ef000-0000-4000-8000-000000000010','Student test app','ai');
insert into public.dreamforge_prompts(project_id,author_id,content) values('da1ef000-0000-4000-8000-000000000020','da1ef000-0000-4000-8000-000000000002','Practice fractions');
do $$ begin
 if not exists(select 1 from public.dreamforge_projects where id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Student cannot read own project'; end if;
 begin
  insert into public.dreamforge_prompts(project_id,author_id,content) values('da1ef000-0000-4000-8000-000000000020','da1ef000-0000-4000-8000-000000000001','Forged author');
  raise exception 'Author spoofing allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.dreamforge_assignments(classroom_id,course_id) values('da1ef000-0000-4000-8000-000000000010',0);
  raise exception 'Student assignment write allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','da1ef000-0000-4000-8000-000000000001',true);
insert into public.dreamforge_assignments(classroom_id,course_id) values('da1ef000-0000-4000-8000-000000000010',0);
do $$ declare before_count integer; new_class uuid; begin
 new_class:=public.dreamforge_create_classroom('Valid RPC test',array['Alex','Sam']);
 if (select count(*) from public.dreamforge_students where classroom_id=new_class)<>2 then raise exception 'Classroom RPC did not save roster'; end if;
 if not exists(select 1 from public.dreamforge_prompts where project_id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Teacher cannot read student prompt'; end if;
 select count(*) into before_count from public.dreamforge_classrooms;
 begin
  perform public.dreamforge_create_classroom('Duplicate test',array['Sam','sam']);
  raise exception 'Duplicate aliases allowed';
 exception when raise_exception then if sqlerrm not like 'Use unique%' then raise; end if; end;
 if (select count(*) from public.dreamforge_classrooms)<>before_count then raise exception 'Failed classroom left partial data'; end if;
end $$;
select set_config('request.jwt.claim.sub','da1ef000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from public.dreamforge_projects where id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Peer can read another student project'; end if;
 if exists(select 1 from public.dreamforge_prompts where project_id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Peer can read another student prompt'; end if;
 if not exists(select 1 from public.dreamforge_assignments where classroom_id='da1ef000-0000-4000-8000-000000000010') then raise exception 'Student cannot read assigned course'; end if;
 end $$;
select set_config('request.jwt.claim.sub','da1ef000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.dreamforge_classrooms where id='da1ef000-0000-4000-8000-000000000010') then raise exception 'Outsider can read classroom'; end if;
 if exists(select 1 from public.dreamforge_projects where id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Outsider can read project'; end if;
 if exists(select 1 from public.dreamforge_prompts where project_id='da1ef000-0000-4000-8000-000000000020') then raise exception 'Outsider can read prompts'; end if;
 begin
  perform public.dreamforge_join_classroom('TESTDREAM123','Learner A');
  raise exception 'Claimed alias can be taken over';
 exception when raise_exception then if sqlerrm not like 'Check your%' then raise; end if; end;
 begin
  insert into public.dreamforge_projects(owner_id,classroom_id,title,kind) values(auth.uid(),'da1ef000-0000-4000-8000-000000000010','Intrusion','ai');
  raise exception 'Outsider can create a classroom project';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.dreamforge_prompts;
  raise exception 'Anonymous prompt access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: classroom joining, prompt persistence, teacher oversight, outsider and peer isolation, author validation, duplicate aliases, anonymous denial; fixtures rolled back' as result;
