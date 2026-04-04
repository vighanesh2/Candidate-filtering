-- Persist AI research output on each application (used by lib/research.ts)
alter table public.applications
  add column if not exists research_profile jsonb,
  add column if not exists research_completed_at timestamptz;

comment on column public.applications.research_profile is 'Structured research: LinkedIn/GitHub/portfolio/Twitter summaries, brief, discrepancies';
comment on column public.applications.research_completed_at is 'When research last finished successfully';
