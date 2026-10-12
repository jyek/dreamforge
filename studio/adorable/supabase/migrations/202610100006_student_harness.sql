begin;
create table if not exists public.harness_projects (
 project_id uuid primary key references public.projects(id) on delete cascade,
 vm_id text not null unique,
 created_at timestamptz not null default now()
);
create table if not exists public.classroom_harness_settings (
 classroom_id uuid primary key references public.classrooms(id) on delete cascade,
 ai_enabled boolean not null default true,
 access_start timestamptz,
 access_end timestamptz,
 daily_token_limit bigint not null default 200000 check(daily_token_limit between 0 and 10000000),
 moderation_level text not null default 'strict' check(moderation_level in ('strict','stricter')),
 check(access_end is null or access_start is null or access_end>access_start)
);
create table if not exists public.token_budgets (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null default (now() at time zone 'UTC')::date,
 token_limit bigint not null default 200000 check(token_limit>=0),
 used_tokens bigint not null default 0 check(used_tokens>=0),
 reserved_tokens bigint not null default 0 check(reserved_tokens>=0),
 primary key(user_id,day)
);
create table if not exists public.token_runs (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id),
 day date not null,
 reserved_tokens bigint not null check(reserved_tokens>=0),
 input_tokens bigint,
 output_tokens bigint,
 model text not null,
 state text not null default 'reserved' check(state in ('reserved','settled','failed')),
 created_at timestamptz not null default now(),
 settled_at timestamptz,
 foreign key(user_id,day) references public.token_budgets(user_id,day)
);
create table if not exists public.harness_safety_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 user_id uuid not null references auth.users(id),
 phase text not null check(phase in ('input','output','tool')),
 decision text not null check(decision in ('allow','block','review')),
 categories text[] not null,
 severity text not null check(severity in ('low','medium','high','critical')),
 content_hash text not null,
 content text not null,
 policy_version text not null,
 review_status text not null default 'pending' check(review_status in ('pending','allowed','blocked')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists harness_safety_project_time on public.harness_safety_events(project_id,created_at);
alter table public.harness_projects enable row level security;
alter table public.classroom_harness_settings enable row level security;
alter table public.token_budgets enable row level security;
alter table public.token_runs enable row level security;
alter table public.harness_safety_events enable row level security;
revoke all on public.harness_projects,public.classroom_harness_settings,public.token_budgets,public.token_runs,public.harness_safety_events from anon,authenticated;
-- Browser writes cannot grant themselves tokens, map VMs, or approve moderation.
notify pgrst,'reload schema';
commit;
