begin;
create schema if not exists adorable;
revoke all on schema adorable from public,anon,authenticated;
create table if not exists adorable.projects (
 vm_id text primary key check(vm_id ~ '^vm-[a-z0-9]+$'),
 metadata jsonb not null check(jsonb_typeof(metadata)='object'),
 updated_at timestamptz not null default now()
);
create table if not exists adorable.conversations (
 vm_id text not null references adorable.projects(vm_id) on delete cascade,
 id uuid not null,
 messages jsonb not null default '[]' check(jsonb_typeof(messages)='array'),
 updated_at timestamptz not null default now(),
 primary key(vm_id,id)
);
create table if not exists adorable.runtime_leases (
 vm_id text primary key references adorable.projects(vm_id) on delete cascade,
 last_activity timestamptz not null default now(),
 paused_at timestamptz,
 hold_until timestamptz
);
alter table adorable.projects enable row level security;
alter table adorable.conversations enable row level security;
alter table adorable.runtime_leases enable row level security;
revoke all on all tables in schema adorable from public,anon,authenticated;
commit;
