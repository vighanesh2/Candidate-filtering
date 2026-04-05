-- Phase 04: AI notetaker output linked to candidate (application)

create table if not exists public.interview_transcripts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  provider text not null
    check (provider in ('fireflies', 'fathom', 'readai', 'otter', 'mock', 'manual')),
  external_id text,
  title text,
  transcript text,
  summary text,
  action_items jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_transcripts_application
  on public.interview_transcripts (application_id, created_at desc);

comment on table public.interview_transcripts is 'Post-interview transcript + summary from notetaker (Fireflies, mock, etc.)';
