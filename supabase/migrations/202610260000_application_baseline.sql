-- Fresh-install baseline. Existing deployments keep their data for the guarded cutover.
-- Original migrations are preserved byte-for-byte under supabase/history/.
begin;
do $baseline$
begin
  if to_regnamespace('adorable') is not null or to_regclass('dreamforge.profiles') is not null then
    return;
  end if;
  execute $ddl$
-- 202610120001_adorable_storage.sql

create schema if not exists dreamforge;
revoke all on schema dreamforge from public,anon,authenticated;
create table if not exists dreamforge.projects (
 vm_id text primary key check(vm_id ~ '^vm-[a-z0-9]+$'),
 metadata jsonb not null check(jsonb_typeof(metadata)='object'),
 updated_at timestamptz not null default now()
);
create table if not exists dreamforge.conversations (
 vm_id text not null references dreamforge.projects(vm_id) on delete cascade,
 id uuid not null,
 messages jsonb not null default '[]' check(jsonb_typeof(messages)='array'),
 updated_at timestamptz not null default now(),
 primary key(vm_id,id)
);
create table if not exists dreamforge.runtime_leases (
 vm_id text primary key references dreamforge.projects(vm_id) on delete cascade,
 last_activity timestamptz not null default now(),
 paused_at timestamptz,
 hold_until timestamptz
);
alter table dreamforge.projects enable row level security;
alter table dreamforge.conversations enable row level security;
alter table dreamforge.runtime_leases enable row level security;
revoke all on all tables in schema dreamforge from public,anon,authenticated;

-- 202610120003_anonymous_safety.sql

create table if not exists dreamforge.safety_events (
 id uuid primary key default gen_random_uuid(),
 vm_id text not null references dreamforge.projects(vm_id) on delete cascade,
 phase text not null check(phase in ('input','output','tool')),
 decision text not null check(decision in ('allow','block','review')),
 categories text[] not null,
 severity text not null check(severity in ('low','medium','high','critical')),
 content_hash text not null,
 content text not null,
 policy_version text not null,
 created_at timestamptz not null default now()
);
create index if not exists anonymous_safety_project_time on dreamforge.safety_events(vm_id,created_at);
alter table dreamforge.safety_events enable row level security;
revoke all on dreamforge.safety_events from anon,authenticated;

-- 202610120003_model_budget.sql

create table if not exists dreamforge.ai_daily_spend(day date primary key,charged_usd numeric not null default 0 check(charged_usd>=0),reserved_usd numeric not null default 0 check(reserved_usd>=0));
create table if not exists dreamforge.ai_attempts(id uuid primary key,day date not null references dreamforge.ai_daily_spend(day),model text not null,reserved_usd numeric not null check(reserved_usd>0),charged_usd numeric,settled_at timestamptz,created_at timestamptz not null default now());
alter table dreamforge.ai_daily_spend enable row level security;
alter table dreamforge.ai_attempts enable row level security;
revoke all on dreamforge.ai_daily_spend,dreamforge.ai_attempts from public,anon,authenticated;

-- 202610130001_runtime_bindings.sql
-- Keep project URLs and conversations stable across the provider migration.
create table if not exists dreamforge.runtime_bindings (
  project_id text primary key,
  sandbox_id text not null unique,
  preview jsonb,
  created_at timestamptz not null default now()
);
alter table dreamforge.runtime_bindings add column if not exists preview jsonb;
alter table dreamforge.runtime_bindings enable row level security;
revoke all on dreamforge.runtime_bindings from anon, authenticated;

-- 202610140001_dreamforge_classrooms.sql

create table dreamforge.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,30}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 auth_email text not null unique,
 role text not null check(role in ('teacher','child')),
 created_at timestamptz not null default now()
);
create table dreamforge.classes (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references dreamforge.profiles(id),
 name text not null check(length(name) between 1 and 80), invite_code text not null unique,
 created_at timestamptz not null default now()
);
create table dreamforge.class_members (
 class_id uuid not null references dreamforge.classes(id) on delete cascade,
 child_id uuid not null references dreamforge.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(class_id,child_id)
);
create index on dreamforge.class_members(child_id);
create table dreamforge.teacher_invites (
 token_hash text primary key, created_by uuid references dreamforge.profiles(id),
 expires_at timestamptz not null default now()+interval '7 days', used_by uuid references dreamforge.profiles(id), used_at timestamptz
);
alter table dreamforge.projects add column owner_id uuid references dreamforge.profiles(id);
alter table dreamforge.projects add column is_example boolean not null default false;
update dreamforge.projects set is_example=true where owner_id is null;
create index on dreamforge.projects(owner_id);
create table dreamforge.token_accounts (
 child_id uuid primary key references dreamforge.profiles(id) on delete cascade,
 token_limit bigint not null default 100000 check(token_limit>=0),
 used_tokens bigint not null default 0 check(used_tokens>=0),
 reserved_tokens bigint not null default 0 check(reserved_tokens>=0),
 input_tokens bigint not null default 0, output_tokens bigint not null default 0,
 estimated_cost_usd numeric not null default 0
);
create table dreamforge.usage_runs (
 id uuid primary key default gen_random_uuid(), child_id uuid not null references dreamforge.profiles(id),
 vm_id text not null references dreamforge.projects(vm_id), model text,
 reserved_tokens bigint not null check(reserved_tokens>0), input_tokens bigint, output_tokens bigint,
 estimated_cost_usd numeric, state text not null default 'reserved' check(state in ('reserved','settled','uncertain')),
 created_at timestamptz not null default now(), settled_at timestamptz
);
create index on dreamforge.usage_runs(child_id,created_at);
create table dreamforge.prompt_reviews (
 id uuid primary key default gen_random_uuid(), vm_id text not null references dreamforge.projects(vm_id) on delete cascade,
 child_id uuid not null references dreamforge.profiles(id), conversation_id uuid not null,
 content text not null, decision text not null, categories text[] not null, severity text not null,
 reviewed_by uuid references dreamforge.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index on dreamforge.prompt_reviews(child_id,created_at);
create table dreamforge.topup_requests (
 token_hash text primary key, child_id uuid not null references dreamforge.profiles(id),
 expires_at timestamptz not null default now()+interval '7 days', created_at timestamptz not null default now()
);
create table dreamforge.payments (
 stripe_session_id text primary key, child_id uuid not null references dreamforge.profiles(id),
 amount_sgd_cents integer not null, tokens bigint not null, credited_at timestamptz not null default now()
);
create table dreamforge.auth_attempts (
 bucket text primary key, attempts integer not null default 1, expires_at timestamptz not null
);
-- These tables are accessed only by the Vercel server. Browser Supabase keys
-- cannot read classroom data or change roles, balances, or project ownership.
do $$ declare t text; begin foreach t in array array['profiles','classes','class_members','teacher_invites','token_accounts','usage_runs','prompt_reviews','topup_requests','payments','auth_attempts'] loop
 execute format('alter table dreamforge.%I enable row level security',t);
 execute format('revoke all on dreamforge.%I from public,anon,authenticated',t);
end loop; end $$;

-- 202610140002_uncertain_usage.sql

alter table dreamforge.usage_runs drop constraint usage_runs_state_check;
alter table dreamforge.usage_runs add constraint usage_runs_state_check check(state in ('reserved','settled','uncertain','released'));
alter table dreamforge.usage_runs add column released_by uuid references dreamforge.profiles(id);
-- Preserve actual input/output totals. An unconfirmed request holds an allowance,
-- rather than inventing a token count. Teachers can release these holds.
update dreamforge.token_accounts a set used_tokens=a.used_tokens-r.tokens,reserved_tokens=a.reserved_tokens+r.tokens
 from (select child_id,sum(reserved_tokens) as tokens from dreamforge.usage_runs where state='uncertain' group by child_id) r where a.child_id=r.child_id;

-- 202610140003_builder_roster.sql

-- A class groups builders. Removing that group must not remove the teacher's
-- roster or access to those builders' projects, tokens and prompt reviews.
create table dreamforge.teacher_builders (
 teacher_id uuid not null references dreamforge.profiles(id) on delete cascade,
 child_id uuid not null references dreamforge.profiles(id) on delete cascade,
 added_at timestamptz not null default now(), primary key(teacher_id,child_id)
);
create index on dreamforge.teacher_builders(child_id);
insert into dreamforge.teacher_builders(teacher_id,child_id)
 select distinct c.teacher_id,m.child_id from dreamforge.classes c join dreamforge.class_members m on m.class_id=c.id;
create function dreamforge.record_teacher_builder() returns trigger language plpgsql as $$
begin
 insert into dreamforge.teacher_builders(teacher_id,child_id)
  select teacher_id,new.child_id from dreamforge.classes where id=new.class_id
  on conflict do nothing;
 return new;
end;
$$;
create trigger record_teacher_builder after insert on dreamforge.class_members
 for each row execute function dreamforge.record_teacher_builder();
alter table dreamforge.teacher_builders enable row level security;
revoke all on dreamforge.teacher_builders from public,anon,authenticated;

-- 202610150001_class_projects.sql

create table if not exists dreamforge.class_projects (
 class_id uuid not null references dreamforge.classes(id) on delete cascade,
 vm_id text not null references dreamforge.projects(vm_id) on delete cascade,
 assigned_by uuid not null references dreamforge.profiles(id),
 created_at timestamptz not null default now(),
 primary key(class_id,vm_id)
);
create index if not exists class_projects_vm_id on dreamforge.class_projects(vm_id);
alter table dreamforge.class_projects enable row level security;
revoke all on dreamforge.class_projects from public,anon,authenticated;

-- 202610160001_classroom_teachers.sql

create table if not exists dreamforge.class_teachers (
 class_id uuid not null references dreamforge.classes(id) on delete cascade,
 teacher_id uuid not null references dreamforge.profiles(id) on delete cascade,
 added_by uuid not null references dreamforge.profiles(id),
 created_at timestamptz not null default now(),
 primary key(class_id,teacher_id)
);
create index if not exists class_teachers_teacher_id on dreamforge.class_teachers(teacher_id);
alter table dreamforge.class_teachers enable row level security;
revoke all on dreamforge.class_teachers from public,anon,authenticated;
alter table dreamforge.teacher_invites add column if not exists classroom_id uuid references dreamforge.classes(id) on delete cascade;

-- 202610170001_execution.sql
-- Service-only execution state, independent of the chat transcript.
create schema if not exists dreamforge;
create table dreamforge.project_execution (
 project_id text primary key, revision bigint not null default 0,
 active_run uuid, verification jsonb, updated_at timestamptz not null default now()
);
create table dreamforge.execution_runs (
 id uuid primary key, project_id text not null references dreamforge.project_execution(project_id),
 conversation_id uuid, state text not null check(state in ('running','completed','failed','cancelled','interrupted')),
 base_revision bigint not null, snapshot_id text, cancel_requested boolean not null default false,
 created_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '5 minutes',
 finished_at timestamptz
);
create unique index one_running_project on dreamforge.execution_runs(project_id) where state='running';
create table dreamforge.execution_events (
 id bigint generated always as identity primary key, run_id uuid not null references dreamforge.execution_runs(id),
 kind text not null, data jsonb not null default '{}', created_at timestamptz not null default now()
);
create index execution_event_run on dreamforge.execution_events(run_id,id);
create table dreamforge.approved_shares (
 id uuid primary key, project_id text not null references dreamforge.project_execution(project_id),
 revision bigint not null, teacher_id uuid not null, snapshot_id text not null,
 url text not null, created_at timestamptz not null default now()
);
alter table dreamforge.project_execution enable row level security;
alter table dreamforge.execution_runs enable row level security;
alter table dreamforge.execution_events enable row level security;
alter table dreamforge.approved_shares enable row level security;
revoke all on dreamforge.project_execution,dreamforge.execution_runs,dreamforge.execution_events,dreamforge.approved_shares from anon,authenticated;

$ddl$;
end;
$baseline$;
commit;
