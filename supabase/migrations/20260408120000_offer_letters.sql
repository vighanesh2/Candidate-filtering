-- Phase 5A: AI offer letter draft + hiring-manager questionnaire snapshot

create table if not exists public.offer_letters (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  questionnaire jsonb not null default '{}'::jsonb,
  draft_body text not null default '',
  review_status text not null default 'draft'
    check (review_status in ('draft', 'approved', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offer_letters_application
  on public.offer_letters (application_id);

comment on table public.offer_letters is 'AI-generated offer letter draft; human review before send (5A).';
