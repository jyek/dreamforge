-- Keep project URLs and conversations stable across the provider migration.
create table if not exists adorable.runtime_bindings (
  project_id text primary key,
  sandbox_id text not null unique,
  preview jsonb,
  created_at timestamptz not null default now()
);
alter table adorable.runtime_bindings add column if not exists preview jsonb;
alter table adorable.runtime_bindings enable row level security;
revoke all on adorable.runtime_bindings from anon, authenticated;
