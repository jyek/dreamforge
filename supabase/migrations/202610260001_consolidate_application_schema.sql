-- Deploy the search-path-compatible application before applying this migration.
-- No CASCADE: unexpected dependencies or legacy data abort the entire transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtext('dreamforge-schema-consolidation'));
do $$
declare
  old_schema text;
  t text;
  has_rows boolean;
  objects text;
  item record;
  retired text[] := array[
    'assignments','budget_accounts','budget_reservations','builds','classroom_controls',
    'classroom_harness_settings','classrooms','feedback','harness_projects','harness_safety_events',
    'messages','model_requests','organization_members','organizations','outbox','policy_versions',
    'project_controls','project_heads','project_members','projects','prompts','publications','reviews',
    'revisions','run_events','runs','safety_decisions','student_controls','students','submissions',
    'token_budgets','token_runs','usage_ledger','verifications','workspaces'
  ];
begin
  if to_regnamespace('adorable') is not null and to_regnamespace('dreamforge') is not null then
    raise exception 'Both application schemas exist; reconcile them before migration';
  end if;
  old_schema := case when to_regnamespace('adorable') is not null then 'adorable' else 'dreamforge' end;
  if to_regclass(format('%I.profiles',old_schema)) is null then
    raise exception 'Expected the current DreamForge account tables';
  end if;
  -- Serialize with beginRun: no new edit may start between this check and commit.
  execute format('lock table %I.project_execution in access exclusive mode',old_schema);
  execute format('select exists(select 1 from %I.project_execution where active_run is not null)',old_schema) into has_rows;
  if has_rows then raise exception 'Finish or recover active project runs before migration'; end if;
  foreach t in array retired loop
    if to_regclass(format('public.%I',t)) is not null then
      execute format('lock table public.%I in access exclusive mode',t);
      execute format('select exists(select 1 from public.%I)',t) into has_rows;
      if has_rows then raise exception 'Legacy table public.% contains data; migration refused',t; end if;
    end if;
  end loop;
  -- Remove only policies attached to the audited retired tables and course catalog.
  for item in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and (tablename=any(retired) or tablename='courses') loop
    execute format('drop policy %I on %I.%I',item.policyname,item.schemaname,item.tablename);
  end loop;
  select string_agg(format('public.%I(%s)',p.proname,pg_get_function_identity_arguments(p.oid)),', ')
    into objects from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array['dreamforge_create_classroom','dreamforge_in_classroom','dreamforge_join_classroom','dreamforge_owns_classroom','dreamforge_reads_project']);
  if objects is not null then execute 'drop function '||objects||' restrict'; end if;
  select string_agg(format('public.%I',name),', ') into objects from unnest(retired) as name
    where to_regclass(format('public.%I',name)) is not null;
  if objects is not null then execute 'drop table '||objects||' restrict'; end if;
  if old_schema='adorable' then alter schema adorable rename to dreamforge; end if;
  if to_regclass('public.courses') is not null then
    alter table public.courses set schema dreamforge;
    alter table dreamforge.courses enable row level security;
    revoke all on dreamforge.courses from public,anon,authenticated;
  end if;
end $$;
-- Stored function bodies contain text; schema renaming does not rewrite them.
create or replace function dreamforge.record_teacher_builder() returns trigger
language plpgsql set search_path = pg_catalog,dreamforge as $$
begin
  insert into dreamforge.teacher_builders(teacher_id,child_id)
    select teacher_id,new.child_id from dreamforge.classes where id=new.class_id
    on conflict do nothing;
  return new;
end $$;
revoke all on schema dreamforge from public,anon,authenticated;
-- Rename the Vault entry through its supported API so encryption metadata stays valid.
do $$ declare secret_id uuid; begin
  if to_regclass('vault.secrets') is not null then
    select id into secret_id from vault.secrets where name='adorable-runtime-cron';
    if secret_id is not null then
      if exists(select 1 from vault.secrets where name='dreamforge-runtime-cron') then
        raise exception 'Both maintenance secrets exist; reconcile before migration';
      end if;
      perform vault.update_secret(secret_id,new_name:='dreamforge-runtime-cron');
    end if;
  end if;
end $$;
-- Cron commands contain SQL text. Recreate through pg_cron's API, retaining its
-- schedule, database, role and active state; the whole change is transactional.
-- Supabase rejects an explicit username for non-superusers, even their own name.
-- The ownership guard permits NULL (the current owner) without changing roles.
do $$ declare item record; begin
  if to_regclass('cron.job') is not null then
    for item in select * from cron.job where jobname='adorable-runtime-maintenance' loop
      if item.username is distinct from current_user then
        raise exception 'Maintenance job is owned by another role; run the cutover as its owner';
      end if;
      perform cron.schedule_in_database('dreamforge-runtime-maintenance',item.schedule,
        replace(replace(item.command,'adorable.','dreamforge.'),'adorable-runtime-cron','dreamforge-runtime-cron'),
        item.database,NULL::text,item.active);
      perform cron.unschedule(item.jobid);
    end loop;
  end if;
end $$;
commit;
