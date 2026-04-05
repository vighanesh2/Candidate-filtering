-- Phase 5B: In-app e-signature (custom portal — no DocuSign/PandaDoc)

alter table public.offer_letters
  add column if not exists signing_token text;

create unique index if not exists idx_offer_letters_signing_token
  on public.offer_letters (signing_token)
  where signing_token is not null;

alter table public.offer_letters
  add column if not exists signing_email_sent_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists signer_ip text,
  add column if not exists signature_method text
    check (signature_method is null or signature_method in ('typed', 'drawn')),
  add column if not exists signature_captured text,
  add column if not exists signer_user_agent text;

comment on column public.offer_letters.signing_token is 'Secret token for /offer/sign/[token] (regenerated when re-sending link).';
comment on column public.offer_letters.signed_at is 'Server timestamp when candidate submitted signature.';
