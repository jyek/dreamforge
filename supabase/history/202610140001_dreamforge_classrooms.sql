begin;
create table adorable.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,30}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 auth_email text not null unique,
 role text not null check(role in ('teacher','child')),
 created_at timestamptz not null default now()
);
create table adorable.classes (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references adorable.profiles(id),
 name text not null check(length(name) between 1 and 80), invite_code text not null unique,
 created_at timestamptz not null default now()
);
create table adorable.class_members (
 class_id uuid not null references adorable.classes(id) on delete cascade,
 child_id uuid not null references adorable.profiles(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(class_id,child_id)
);
create index on adorable.class_members(child_id);
create table adorable.teacher_invites (
 token_hash text primary key, created_by uuid references adorable.profiles(id),
 expires_at timestamptz not null default now()+interval '7 days', used_by uuid references adorable.profiles(id), used_at timestamptz
);
alter table adorable.projects add column owner_id uuid references adorable.profiles(id);
alter table adorable.projects add column is_example boolean not null default false;
update adorable.projects set is_example=true where owner_id is null;
create index on adorable.projects(owner_id);
create table adorable.token_accounts (
 child_id uuid primary key references adorable.profiles(id) on delete cascade,
 token_limit bigint not null default 100000 check(token_limit>=0),
 used_tokens bigint not null default 0 check(used_tokens>=0),
 reserved_tokens bigint not null default 0 check(reserved_tokens>=0),
 input_tokens bigint not null default 0, output_tokens bigint not null default 0,
 estimated_cost_usd numeric not null default 0
);
create table adorable.usage_runs (
 id uuid primary key default gen_random_uuid(), child_id uuid not null references adorable.profiles(id),
 vm_id text not null references adorable.projects(vm_id), model text,
 reserved_tokens bigint not null check(reserved_tokens>0), input_tokens bigint, output_tokens bigint,
 estimated_cost_usd numeric, state text not null default 'reserved' check(state in ('reserved','settled','uncertain')),
 created_at timestamptz not null default now(), settled_at timestamptz
);
create index on adorable.usage_runs(child_id,created_at);
create table adorable.prompt_reviews (
 id uuid primary key default gen_random_uuid(), vm_id text not null references adorable.projects(vm_id) on delete cascade,
 child_id uuid not null references adorable.profiles(id), conversation_id uuid not null,
 content text not null, decision text not null, categories text[] not null, severity text not null,
 reviewed_by uuid references adorable.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index on adorable.prompt_reviews(child_id,created_at);
create table adorable.topup_requests (
 token_hash text primary key, child_id uuid not null references adorable.profiles(id),
 expires_at timestamptz not null default now()+interval '7 days', created_at timestamptz not null default now()
);
create table adorable.payments (
 stripe_session_id text primary key, child_id uuid not null references adorable.profiles(id),
 amount_sgd_cents integer not null, tokens bigint not null, credited_at timestamptz not null default now()
);
create table adorable.auth_attempts (
 bucket text primary key, attempts integer not null default 1, expires_at timestamptz not null
);
-- These tables are accessed only by the Vercel server. Browser Supabase keys
-- cannot read classroom data or change roles, balances, or project ownership.
do $$ declare t text; begin foreach t in array array['profiles','classes','class_members','teacher_invites','token_accounts','usage_runs','prompt_reviews','topup_requests','payments','auth_attempts'] loop
 execute format('alter table adorable.%I enable row level security',t);
 execute format('revoke all on adorable.%I from public,anon,authenticated',t);
end loop; end $$;
commit;
