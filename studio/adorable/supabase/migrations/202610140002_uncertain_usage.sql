begin;
alter table adorable.usage_runs drop constraint usage_runs_state_check;
alter table adorable.usage_runs add constraint usage_runs_state_check check(state in ('reserved','settled','uncertain','released'));
alter table adorable.usage_runs add column released_by uuid references adorable.profiles(id);
-- Preserve actual input/output totals. An unconfirmed request holds an allowance,
-- rather than inventing a token count. Teachers can release these holds.
update adorable.token_accounts a set used_tokens=a.used_tokens-r.tokens,reserved_tokens=a.reserved_tokens+r.tokens
 from (select child_id,sum(reserved_tokens) as tokens from adorable.usage_runs where state='uncertain' group by child_id) r where a.child_id=r.child_id;
commit;
