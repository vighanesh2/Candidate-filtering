# Architecture & technical overview

This document describes the **Candidate Filtering** / hiring pipeline app: stack, AI usage, integrations, and how data flows through the system.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| **Framework** | [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS 4 |
| **Database & auth (data)** | [Supabase](https://supabase.com) (Postgres + Storage for resumes) |
| **Hosting (typical)** | [Vercel](https://vercel.com) — serverless route handlers, `@vercel/functions` `waitUntil` for Slack event follow-up work |
| **Email** | [Resend](https://resend.com) (`resend` SDK) for transactional mail |
| **Calendar** | Google Calendar API via `googleapis` (OAuth client + refresh token) |
| **Background / cron-style** | Vercel Cron–style `GET` routes guarded by `CRON_SECRET` (scheduling nudges, calendar RSVP sync) |

**Document & resume parsing**

- PDF: `pdf-parse` (screening path)
- DOCX: `mammoth` (text extraction for Claude)

---

## AI & ML-adjacent tools

### Anthropic Claude (`lib/claude-client.ts`)

- **Primary path:** Direct [Anthropic Messages API](https://docs.anthropic.com/) when `ANTHROPIC_API_KEY` is set (`ANTHROPIC_MODEL` optional; default tuned in code).
- **Alternate path:** [Lava](https://lava.so) forward proxy when only `LAVA_FORWARD_TOKEN` is set (`LAVA_ANTHROPIC_MODEL` must match Lava’s allowlist). Used where shorter timeouts apply; research mode reduces Tavily depth when stuck on Lava-only.

**Where Claude is used**

| Feature | Module | Role |
|---------|--------|------|
| Resume screening | `lib/screen.ts` | PDF/DOCX + JD → structured JSON (score, rationale, skills, etc.); threshold via `AI_SHORTLIST_THRESHOLD` |
| Deep candidate research | `lib/research.ts` | Synthesizes brief from web/GitHub signals + Tavily snippets |
| Offer letter draft | `lib/offer-letter.ts` | Generates offer copy from questionnaire + candidate context |
| Slack welcome DM | `lib/slack-onboarding.ts` | Natural-language welcome (not a fixed template); uses questionnaire + manager + optional profile hints |
| Scheduling alternatives | `lib/schedule-alternatives.ts` | Picks best 3 slots from a larger pool from candidate note (JSON-only reply) |

### Tavily (`@tavily/core`)

- **`lib/research.ts`** — web search to gather LinkedIn-adjacent and general web context for the research profile. Depth/result limits are reduced in “Lava safe mode” when there is no direct Anthropic key.

### Speech / transcripts

- **AssemblyAI** (`assemblyai` SDK) — `lib/interview-transcript.ts` for audio → transcript.
- **Fireflies** — optional API import path in the same module when `FIREFLIES_API_KEY` is set.

---

## Integrations (how they work)

### Supabase

- **Client:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe where used).
- **Server:** `SUPABASE_SERVICE_ROLE_KEY` in `lib/supabase.ts` for API routes (bypass RLS for admin operations).
- **Storage:** Private `resumes` bucket; uploads from `POST /api/apply`.
- **Migrations:** `supabase/migrations/*.sql` define `applications`, interview slots, offer letters, signing columns, Slack onboarding columns, transcripts, etc.

### Resend

- Used across **`lib/schedule.ts`**, **`lib/schedule-alternatives.ts`**, **`lib/calendar-rsvp-sync.ts`**, **`lib/offer-signing.ts`**, **`lib/slack-onboarding.ts`**, **`app/api/apply/route.ts`**.
- Requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- Scheduling, offer signing links, application confirmation, Slack invite email, and interviewer notifications all go through the same provider.

### Google Calendar

- **`lib/calendar.ts`** — single refresh-token style setup (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`).
- **Scheduling (`lib/schedule.ts`)** creates tentative events, confirms one slot, deletes others; emails contain links back to the app.
- **RSVP sync (`lib/calendar-rsvp-sync.ts`)** reads attendee response on confirmed events and emails the interviewer when the candidate accepts in Calendar (`CRON_SECRET` on cron route).

### Slack (onboarding)

- **`lib/slack-onboarding.ts`**
  - After **offer signed** (and via **admin** `POST .../slack-invite`): optional Enterprise `admin.users.invite`, Resend email with `SLACK_WORKSPACE_INVITE_URL`, updates `offer_letters` invite timestamps.
  - **`POST /api/slack/events`**: Verifies `SLACK_SIGNING_SECRET`, handles URL verification, on `team_join` runs `handleSlackTeamJoinEvent` inside `waitUntil` — resolves user email, matches signed offer, generates AI welcome, DMs via bot (`SLACK_BOT_TOKEN`), notifies `SLACK_HR_CHANNEL_ID` if set.
- **Env:** `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_WORKSPACE_INVITE_URL`, optional `SLACK_HR_CHANNEL_ID`, `SLACK_ONBOARDING_RESOURCE_URLS`, optional Grid admin invite vars.

### Admin access

- **`middleware.ts`** — cookie `admin_session` must equal `ADMIN_PASSWORD` for `/admin/*` routes only (not `/api/admin/*` in the matcher; API security is “obscurity + same-origin admin UI” in practice).
- **`POST /api/admin/login`** sets the cookie.

### GitHub (optional)

- **`GITHUB_TOKEN`** in `lib/research.ts` for richer public API access when building the research profile.

---

## High-level product flow

1. **Apply** — `POST /api/apply` uploads resume, inserts row, triggers **`screenCandidate`** (Claude + optional **`researchCandidate`** pipeline pieces).
2. **Admin** — Review scores, research, transcripts; move status; **send scheduling** (3 tentative Calendar holds + email).
3. **Candidate** — Picks slot on `/schedule/[token]`; confirmations emailed; Calendar invite is source of truth for Meet/RSVP.
4. **Alternatives** — Candidate can request other times; interviewer approves via token link; AI may rank slot options.
5. **Offer** — Questionnaire + AI draft; approve; send signing link; **custom in-app e-sign** (`/offer/sign/[token]`) stores signature + audit fields in Postgres (not DocuSign).
6. **Slack** — On sign (and manual admin button): invite email + DB; on workspace join: AI welcome DM + HR post.

---

## What we would improve with more time

1. **Admin API hardening** — Authenticate `/api/admin/*` with the same session (or service token) as the UI; avoid relying on unauthenticated POSTs if URLs leak.
2. **E-sign maturity** — For compliance-heavy use cases, swap the canvas/typed flow for **DocuSign / Dropbox Sign** with webhooks and certificate of completion; keep the current flow for demos.
3. **Email abstraction** — Single `sendTransactionalEmail` interface with provider behind env (Resend vs SMTP vs EmailJS) and clearer failure/retry semantics.
4. **Observability** — Structured logging, correlation IDs, and alerting on screening failures, Slack verification failures, and Resend bounces.
5. **Tests** — Contract tests for Claude JSON outputs, API route integration tests with mocked Supabase, and Playwright for apply → admin happy paths.
6. **Slack robustness** — Idempotency keys, dead-letter handling if AI fails after DM partially sent, and explicit handling for email mismatch (Slack primary email ≠ application email).
7. **Multi-tenant / RBAC** — Replace single shared `ADMIN_PASSWORD` with proper user accounts and role-based access to candidate PII.
8. **Rate limits & abuse** — Stricter throttling on apply, signing, and public scheduling tokens; CAPTCHA on apply if needed.
9. **Data retention** — Policies for raw resumes, drawn signatures, and transcript text; encryption-at-rest expectations documented per region.
10. **CI/CD** — Lint + test + migration checks on every PR; preview envs with scoped secrets.

---

## Related files

| Area | Key paths |
|------|-----------|
| Screening | `lib/screen.ts`, `app/api/apply/route.ts` |
| Research | `lib/research.ts`, `app/api/admin/.../research` |
| Scheduling | `lib/schedule.ts`, `lib/schedule-alternatives.ts`, `lib/scheduling-holds.ts` |
| Calendar | `lib/calendar.ts`, `lib/calendar-rsvp-sync.ts` |
| Offer | `lib/offer-letter.ts`, `lib/offer-signing.ts`, `app/api/offer/sign/[token]/route.ts` |
| Slack | `lib/slack-onboarding.ts`, `app/api/slack/events/route.ts` |
| Jobs config | `lib/jobs.ts` (static JDs; could move to CMS) |

---

## Edge cases

See **[EDGE_CASES.md](./EDGE_CASES.md)** for a concise write-up of the top five production edge cases (duplicate applications, closed roles, scheduling races, offer signing, Slack welcome deduplication).

## Deliberate trade-offs

See **[TRADEOFFS.md](./TRADEOFFS.md)** for documented simplifications (custom e-sign vs vendor, admin auth model, Google Calendar OAuth shape, jobs in code, Slack matching strategy, research “safe mode” under Lava).

---

*Last updated to match the repository layout as of the doc author’s pass; adjust env names in deployment dashboards to match `README.md`.*
