-- Service-only execution state, independent of the chat transcript.
create schema if not exists adorable;
create table adorable.project_execution (
 project_id text primary key, revision bigint not null default 0,
 active_run uuid, verification jsonb, updated_at timestamptz not null default now()
);
create table adorable.execution_runs (
 id uuid primary key, project_id text not null references adorable.project_execution(project_id),
 conversation_id uuid, state text not null check(state in ('running','completed','failed','cancelled','interrupted')),
 base_revision bigint not null, snapshot_id text, cancel_requested boolean not null default false,
 created_at timestamptz not null default now(), deadline timestamptz not null default now()+interval '5 minutes',
 finished_at timestamptz
);
create unique index one_running_project on adorable.execution_runs(project_id) where state='running';
create table adorable.execution_events (
 id bigint generated always as identity primary key, run_id uuid not null references adorable.execution_runs(id),
 kind text not null, data jsonb not null default '{}', created_at timestamptz not null default now()
);
create index execution_event_run on adorable.execution_events(run_id,id);
create table adorable.approved_shares (
 id uuid primary key, project_id text not null references adorable.project_execution(project_id),
 revision bigint not null, teacher_id uuid not null, snapshot_id text not null,
 url text not null, created_at timestamptz not null default now()
);
alter table adorable.project_execution enable row level security;
alter table adorable.execution_runs enable row level security;
alter table adorable.execution_events enable row level security;
alter table adorable.approved_shares enable row level security;
revoke all on adorable.project_execution,adorable.execution_runs,adorable.execution_events,adorable.approved_shares from anon,authenticated;
