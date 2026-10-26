begin;
create table if not exists adorable.ai_daily_spend(day date primary key,charged_usd numeric not null default 0 check(charged_usd>=0),reserved_usd numeric not null default 0 check(reserved_usd>=0));
create table if not exists adorable.ai_attempts(id uuid primary key,day date not null references adorable.ai_daily_spend(day),model text not null,reserved_usd numeric not null check(reserved_usd>0),charged_usd numeric,settled_at timestamptz,created_at timestamptz not null default now());
alter table adorable.ai_daily_spend enable row level security;
alter table adorable.ai_attempts enable row level security;
revoke all on adorable.ai_daily_spend,adorable.ai_attempts from public,anon,authenticated;
commit;
