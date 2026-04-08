# Candidate filtering (hiring pipeline)

A **Next.js** app for job postings, applications, AI-assisted resume screening and research, interview scheduling with **Google Calendar**, in-app **offer signing**, and **Slack** onboarding after an offer is signed.

For a full **tech stack, AI usage, integrations, and roadmap-style improvements**, see **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

## Requirements

- Node.js 20+ (recommended)
- Supabase project (Postgres + Storage)
- API keys for features you enable (Anthropic and/or Lava, Tavily, Resend, Google OAuth for Calendar, Slack app, etc.)

## Local setup

```bash
npm install
# Create .env.local at the repo root (see docs/ARCHITECTURE.md for variable names).
```

Set at minimum (names only — values are yours):

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Admin:** `ADMIN_PASSWORD`
- **App URL:** `NEXT_PUBLIC_BASE_URL` (used in emails and signing links)
- **AI:** `ANTHROPIC_API_KEY` (recommended) or `LAVA_FORWARD_TOKEN` + `LAVA_ANTHROPIC_MODEL` as needed
- **Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **Optional:** `TAVILY_API_KEY`, `GITHUB_TOKEN`, Google Calendar vars, Slack vars, `CRON_SECRET`, transcript keys — see **Architecture** doc

Apply database migrations (Supabase CLI or SQL Editor):

```bash
# e.g. supabase db push — or run files under supabase/migrations/ manually
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the careers site; `/admin/login` for the hiring console.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |

## Documentation

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Stack, AI tools, how each integration works, and improvement ideas.
- **[docs/EDGE_CASES.md](./docs/EDGE_CASES.md)** — **Edge case documentation:** the top five edge cases the app handles explicitly (duplicates, closed roles, scheduling races, offer-sign idempotency, Slack welcome deduplication), plus a short “honorable mentions” list.

## License

Private project — adjust as needed.
