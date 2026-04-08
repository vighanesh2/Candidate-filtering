# Edge case documentation

This app anticipates several failure and race modes in hiring workflows. Below are **five of the most important** edge cases and how the code handles them.

---

### 1. Duplicate application (same person, same role)

**Risk:** A candidate submits the apply form twice, or refreshes after submit, creating duplicate rows or inconsistent data.

**Handling:**

- The database enforces uniqueness on **`(email, role_id)`** (or equivalent constraint in your migrations).
- On insert failure with Postgres code **`23505`**, `POST /api/apply` returns **409** with a clear message: *“You've already applied for this role…”* instead of a generic database error.
- Other insert failures still attempt to **remove the uploaded resume** from storage so you do not leave orphaned files when the DB write fails for non-duplicate reasons.

**Where:** `app/api/apply/route.ts`

---

### 2. Closed or paused job posting

**Risk:** Someone keeps an old apply page open after a role is marked closed; they should not get a successful application.

**Handling:**

- Before accepting the form, the handler checks **`job.open`** from static job config (`lib/jobs.ts`).
- If the role is closed, the API returns **409** with *“This position is no longer accepting applications.”*

**Where:** `app/api/apply/route.ts`

---

### 3. Interview scheduling: double-click, races, and cross-candidate conflicts

**Risk:**

- Two tabs or double-clicks try to confirm the **same** tentative slot at once.
- **Different** candidates could otherwise be offered overlapping wall-clock times on the same interviewer’s calendar.

**Handling:**

- **Atomic claim:** `confirmSlot` updates the chosen row with **`.eq("status", "tentative")`** and only proceeds if the update returns a row. If another session already flipped the slot, the update affects **zero** rows and the user sees *“Slot no longer available — someone else may have confirmed it.”*
- **First-come, first-served:** Copy and UX state that only one option can be confirmed; unchosen tentatives are cancelled after a successful confirm.
- **Cross-candidate blocking:** When finding free times, the system includes **other candidates’ tentative holds** for that interviewer so new offers do not overlap pending options (scheduling spec “3B”).

**Where:** `lib/schedule.ts` (`confirmSlot`, `sendSchedulingOptions`, `cancelTentativeSlotsForApplication`), `lib/scheduling-holds.ts`, `lib/calendar.ts`

---

### 4. Offer signing: repeat submits and invalid payloads

**Risk:**

- Candidate submits twice (double submit, back button).
- Huge or malformed drawn signature payloads abuse storage or break requests.
- Offer link reused after completion.

**Handling:**

- **Already signed:** If `signed_at` is set, **POST** returns **409**; **GET** still returns `alreadySigned: true` so the UI can show a thank-you state without exposing a new signature flow.
- **Idempotent write:** The final update uses **`.is("signed_at", null)`** so concurrent first-time submits cannot both win; only one transition from unsigned → signed succeeds reliably.
- **Validation:** Typed name length bounds; drawn signature must be a **PNG data URL** with a **maximum length** cap to limit abuse.
- **Legal gate:** Signing is rejected unless **`acceptElectronicSignature === true`**.

**Where:** `app/api/offer/sign/[token]/route.ts`, `app/offer/sign/[token]/page.tsx`

---

### 5. Slack onboarding: duplicate welcome DMs / concurrent `team_join`

**Risk:** Slack may retry events, or two workers could process the same join; the candidate could get **two** welcome DMs or HR could be spammed.

**Handling:**

- After generating the message and posting to the DM channel, the code updates **`offer_letters`** with **`.is("slack_welcome_sent_at", null)`**. Only the first successful updater gets rows back; others **stop** before notifying HR or treating the flow as complete.
- **HR notification** runs only after that conditional update succeeds, so you do not announce “onboarding complete” if another path already consumed the welcome send.

**Where:** `lib/slack-onboarding.ts` (`handleSlackTeamJoinEvent`)

---

## Honorable mentions (not in the top five)

- **Alternative scheduling proposals:** One **pending** proposal at a time; approve/decline paths guard “already processed” (`lib/schedule-alternatives.ts`).
- **Research under tight serverless limits:** Without a direct Anthropic key, Tavily depth/result limits shrink so research is more likely to finish within Lava-style timeouts (`lib/research.ts`).
- **Calendar delete idempotency:** Deleting a tentative Google event **ignores 404** if the event was already removed (`lib/calendar.ts`).
- **Slack Enterprise invite:** `admin.users.invite` treats **`email_already_in_team`** as success so re-invites do not fail the flow (`lib/slack-onboarding.ts`).

---

*If you add new workflows, extend this doc with the constraint (DB, atomic update, or idempotency key) you rely on.*
