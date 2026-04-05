-- 3C: track Google Calendar attendee RSVP (Yes/No) — not email replies

alter table public.interview_slots
  add column if not exists calendar_candidate_rsvp text
    check (
      calendar_candidate_rsvp is null
      or calendar_candidate_rsvp in ('needs_action', 'accepted', 'declined', 'tentative', 'unknown')
    ),
  add column if not exists calendar_rsvp_synced_at timestamptz,
  add column if not exists calendar_acceptance_notified boolean not null default false;

comment on column public.interview_slots.calendar_candidate_rsvp is 'Google Calendar attendee responseStatus for the candidate';
comment on column public.interview_slots.calendar_acceptance_notified is 'True after interviewer was emailed that candidate accepted the invite';
