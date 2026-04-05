-- Allow AssemblyAI as notetaker provider (free-tier transcription)

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  join pg_namespace n on t.relnamespace = n.oid
  where n.nspname = 'public'
    and t.relname = 'interview_transcripts'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%provider%'
  limit 1;
  if conname is not null then
    execute format('alter table public.interview_transcripts drop constraint %I', conname);
  end if;
end $$;

alter table public.interview_transcripts add constraint interview_transcripts_provider_check
  check (
    provider in (
      'assemblyai',
      'fireflies',
      'fathom',
      'readai',
      'otter',
      'mock',
      'manual'
    )
  );
