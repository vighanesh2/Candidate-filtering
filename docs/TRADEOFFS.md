# Deliberate trade-offs

This project makes several **intentional** simplifications or non-ideal choices to ship faster, keep the stack small, or match a demo/hiring-tool scope. Below are **more than three** documented trade-offs, with **why** each was chosen and what you give up.

---

### 1. Custom in-app offer signing instead of DocuSign / PandaDoc / Dropbox Sign

**What we did:** Candidates sign on `/offer/sign/[token]` with a typed legal name or a canvas-drawn PNG. The server stores signature metadata, IP, and user agent in Postgres and emails alerts—**no** third-party e-sign API or completion webhooks.

**Why:** Avoids another vendor (OAuth apps, envelope APIs, webhook HMAC, per-seat pricing). Everything stays in **Next.js + Supabase + Resend**, which is easier to run in a hackathon, classroom, or small-team deployment.

**Trade-off:** You do **not** get a vendor “certificate of completion,” long-term audit vaulting, or battle-tested legal templates out of the box. For regulated employers, you would replace this flow with a proper e-sign provider and async `envelope-completed` handling.

**Where:** `app/offer/sign/[token]`, `app/api/offer/sign/[token]/route.ts`, `docs/phase-05b-offer-signing.md`

---

### 2. “Admin auth” = shared password cookie; API routes not gated by the same middleware

**What we did:** `/admin/*` UI is protected by `middleware.ts` checking a cookie equal to `ADMIN_PASSWORD`. Many **`/api/admin/*`** handlers do **not** repeat that check—they assume only your logged-in admin UI will call them.

**Why:** Fastest path to a working internal console without user tables, JWTs, or session stores. Fine when the app is internal and URLs are not widely exposed.

**Trade-off:** Anyone who can **guess or leak** an admin API URL can hit it unless you add server-side session verification (or API keys) on those routes. This is called out as a future improvement in `ARCHITECTURE.md`.

**Where:** `middleware.ts`, `app/api/admin/**`

---

### 3. One Google OAuth refresh token for Calendar (not per-interviewer OAuth)

**What we did:** `lib/calendar.ts` builds a single OAuth2 client from **`GOOGLE_REFRESH_TOKEN`** (plus client id/secret). Scheduling creates and updates events using that identity, keyed by **`interviewerEmail`** from static job config for *which* calendar to touch—but the **API credentials** are still one connected account flow as typically configured.

**Why:** One-time OAuth setup in a README is workable for a demo or a single hiring coordinator. Avoids building “Connect Google” for every interviewer.

**Trade-off:** In a multi-recruiter org, you either share one calendar service account or you must evolve to **per-user OAuth** (store refresh tokens per interviewer). Misconfiguration can mean events land on the wrong calendar or all actions run as one Google user.

**Where:** `lib/calendar.ts`, `lib/jobs.ts` (`interviewerEmail`)

---

### 4. Job postings live in code (`lib/jobs.ts`), not a CMS or database

**What we did:** Roles, copy, JD bullets, and interviewer email are **TypeScript constants**, not rows in Supabase.

**Why:** Zero extra admin UI for “edit job”; type-safe references (`role_id` strings) everywhere; trivial to version in Git.

**Trade-off:** Marketing or TA cannot change a listing without a **deploy**. No A/B copy, no per-tenant branding, no headcount fields without code changes.

**Where:** `lib/jobs.ts`, `app/page.tsx` / apply flow

---

### 5. Slack onboarding: workspace invite link + email matching (not full HRIS / SCIM)

**What we did:** After sign (or manual admin action), the app emails a **shared** `SLACK_WORKSPACE_INVITE_URL`. When Slack fires **`team_join`**, the handler loads the member’s email via Slack API and matches **`applications.email`** (case-insensitive) to find a signed offer before sending the AI welcome DM.

**Why:** Works on standard Slack workspaces without Enterprise Grid-only APIs for every path. Minimal moving parts: Events API + bot token + Resend.

**Trade-off:** If the candidate joins Slack with a **different primary email** than the application, **no match** → no welcome automation. You are not syncing HRIS employee IDs or using Slack’s directory as source of truth. Enterprise-only features (e.g. `admin.users.invite`) are optional env-flag extras, not required.

**Where:** `lib/slack-onboarding.ts`, `app/api/slack/events/route.ts`

---

### 6. (Bonus) Research “safe mode” when only Lava forward is available

**What we did:** If **`ANTHROPIC_API_KEY`** is unset and traffic goes through **Lava** with tight serverless limits, Tavily search uses **shallower / fewer** results so the combined pipeline is more likely to finish in time.

**Why:** Prevents frequent timeouts on small serverless budgets.

**Trade-off:** Research quality and source depth are **reduced** compared to direct Anthropic + full Tavily settings—an explicit quality-vs-latency knob.

**Where:** `lib/research.ts` (`useLavaSafeMode`)

---

## Summary

| Trade-off | Gained | Sacrificed |
|-----------|--------|------------|
| Custom e-sign | Simplicity, cost, one stack | Vendor-grade legal audit trail |
| Password-only admin + open admin APIs | Speed to ship | Strong API boundary security |
| Single Calendar OAuth pattern | Easy setup | Multi-interviewer Google reality |
| Jobs in code | Types + Git | Non-dev editing, no CMS |
| Slack link + email match | Works on common Slack | Fragile if emails differ |
| Lava safe research | Fewer timeouts | Richer automated research |

---

*When you harden this for production, decide which rows in the table you want to reverse first—usually admin API auth and e-sign vendor.*
