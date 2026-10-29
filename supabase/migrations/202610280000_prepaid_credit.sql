-- Back up and drain usage before applying. Required before deploying dollar billing.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table dreamforge.project_execution, dreamforge.token_accounts, dreamforge.usage_runs in access exclusive mode;
do $$ begin
 if exists(select 1 from dreamforge.project_execution where active_run is not null)
 or exists(select 1 from dreamforge.usage_runs where state in ('reserved','uncertain'))
 or exists(select 1 from dreamforge.token_accounts where reserved_tokens<>0)
 then raise exception 'Resolve all usage reservations before converting balances'; end if;
end $$;
alter table dreamforge.token_accounts
 add column credit_limit_micros bigint not null default 10000000 check(credit_limit_micros>=0),
 add column credit_used_micros bigint not null default 0 check(credit_used_micros>=0),
 add column credit_reserved_micros bigint not null default 0 check(credit_reserved_micros>=0);
-- Proposed goodwill conversion: remaining token x S$5 / 1M tokens.
-- This is the highest old package price per token, so discounted purchases gain
-- value rather than losing it. Historical counters/receipts stay untouched.
update dreamforge.token_accounts set credit_limit_micros=greatest(0,token_limit-used_tokens)*5;
alter table dreamforge.usage_runs
 add column credit_reserved_micros bigint check(credit_reserved_micros>=0),
 add column credit_cost_micros bigint check(credit_cost_micros>=0),
 add column billing_version text,
 add column cache_read_tokens bigint check(cache_read_tokens>=0),
 add column cache_write_tokens bigint check(cache_write_tokens>=0);
alter table dreamforge.payments add column credit_micros bigint check(credit_micros>=0);
-- Old payment receipts remain token receipts; retrying them cannot grant twice.
commit;
