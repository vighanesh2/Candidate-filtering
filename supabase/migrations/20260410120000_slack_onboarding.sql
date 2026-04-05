-- Phase 06: Slack onboarding after signed offer

alter table public.offer_letters
  add column if not exists slack_invite_sent_at timestamptz,
  add column if not exists slack_invite_method text
    check (slack_invite_method is null or slack_invite_method in ('admin_api', 'email_link', 'both')),
  add column if not exists slack_user_id text,
  add column if not exists slack_welcome_sent_at timestamptz,
  add column if not exists slack_welcome_message text,
  add column if not exists slack_hr_notified_at timestamptz;

comment on column public.offer_letters.slack_user_id is 'Slack member ID after team_join; used for idempotency.';
comment on column public.offer_letters.slack_welcome_message is 'AI-generated welcome DM text (audit).';
