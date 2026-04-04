-- 3B: global holds, alternative proposals, 48h follow-up tracking

alter table public.interview_slots
  add column if not exists offer_batch_id uuid;

alter table public.applications
  add column if not exists scheduling_follow_up_sent_at timestamptz,
  add column if not exists scheduling_awaiting_alternatives boolean not null default false;

create table if not exists public.scheduling_alternative_proposals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  interviewer_email text not null,
  token text not null unique,
  candidate_note text,
  proposed_slots jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'superseded')),
  created_at timestamptz not null default now()
);

create index if not exists idx_sched_alt_prop_token
  on public.scheduling_alternative_proposals (token);

create index if not exists idx_sched_alt_prop_application
  on public.scheduling_alternative_proposals (application_id);

create index if not exists idx_sched_alt_prop_pending_app
  on public.scheduling_alternative_proposals (application_id)
  where status = 'pending';
