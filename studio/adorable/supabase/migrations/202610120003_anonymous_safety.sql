begin;
create table if not exists adorable.safety_events (
 id uuid primary key default gen_random_uuid(),
 vm_id text not null references adorable.projects(vm_id) on delete cascade,
 phase text not null check(phase in ('input','output','tool')),
 decision text not null check(decision in ('allow','block','review')),
 categories text[] not null,
 severity text not null check(severity in ('low','medium','high','critical')),
 content_hash text not null,
 content text not null,
 policy_version text not null,
 created_at timestamptz not null default now()
);
create index if not exists anonymous_safety_project_time on adorable.safety_events(vm_id,created_at);
alter table adorable.safety_events enable row level security;
revoke all on adorable.safety_events from anon,authenticated;
commit;
