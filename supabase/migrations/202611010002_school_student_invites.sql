begin;
create table dreamforge.student_invites (
 token_hash text primary key,
 school_id uuid not null references dreamforge.schools(id) on delete cascade,
 created_by uuid not null references dreamforge.profiles(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 used_by uuid references dreamforge.profiles(id),
 used_at timestamptz
);
alter table dreamforge.student_invites enable row level security;
revoke all on dreamforge.student_invites from public,anon,authenticated;
commit;
