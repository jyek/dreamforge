-- Questionable prompts can be held for the student's teacher to approve.
-- Only moderation "review" outcomes are held; blocked prompts are never approvable.
begin;
set local lock_timeout='5s';
alter table dreamforge.prompt_reviews
 add column hold_status text check(hold_status in ('pending','approved','denied')),
 add column held_prompt_used_at timestamptz;
create index prompt_reviews_pending_hold on dreamforge.prompt_reviews(child_id,created_at) where hold_status='pending';
-- Browser roles already have no access to prompt_reviews (see the baseline).
commit;
