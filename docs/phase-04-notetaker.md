# Phase 04 — Live interview & AI notetaker

## Recommended (free tier)

**AssemblyAI** — [Dashboard / API key](https://www.assemblyai.com/dashboard), generous **free developer credits**, official Node SDK (`assemblyai`).

- **Production / Vercel:** send a **public `https://` URL** to the recording (S3 public, signed link, Dropbox direct, etc.). The server calls `transcripts.transcribe({ audio: url, speaker_labels: true })` and stores the result.
- **Small local tests:** optional multipart upload (`/api/admin/applications/[id]/interview-transcript/assembly`) capped at **4 MB** so typical serverless body limits are respected.
- Env: **`ASSEMBLYAI_API_KEY`** (required for this path).

Admin: candidate in **In interview** or **Offer** → **Transcribe (free tier)** with URL, or small file upload.

## Other options reviewed

| Product | API / integration | Verdict |
|--------|---------------------|--------|
| **Fireflies.ai** | Public **GraphQL** API at `https://api.fireflies.ai/graphql`, **Bearer API key**. `transcript(id)` returns sentences, speakers, summary. [Docs](https://docs.fireflies.ai/graphql-api/query/transcript) | **Optional** — often paid for API; good if you already use Fireflies. |
| **Fathom** | Public REST API + **webhooks** (`developers.fathom.ai`). | Strong backup. |
| **Read.ai** | Webhooks / MCP; less of a single-document “fetch transcript by id” story. | Defer unless org standardizes on Read. |
| **Otter.ai** | API beta / not fully self-serve. | Poor fit for immediate automation. |

## Fireflies setup — bot joins Meet + import into this app (optional)

### A. Fireflies account (the notetaker bot)

1. Sign up at [app.fireflies.ai](https://app.fireflies.ai/).
2. **Connect the calendar** that has your interview events (Google Calendar is typical for Google Meet). Fireflies uses this to know when to join. In Fireflies, open **Settings** / **Integrations** and connect **Google Calendar** (or your provider).
3. Turn on **auto-join** (wording varies: “join scheduled meetings,” “record meetings,” etc.) so Fireflies can add **Fred** (their notetaker) to calls it finds on the calendar.
4. **Invite Fred to the meeting** if auto-join misses one: in Meet, use “Add people” and paste the **Fireflies notetaker email** Fireflies shows in their docs/dashboard (or add the meeting URL manually in Fireflies if they offer “add meeting link”).

After the call ends, wait until Fireflies finishes processing (usually a few minutes). The conversation should appear in your Fireflies **Notebook** / meetings list.

### B. API key for this Next.js app

1. In Fireflies go to **[Integrations](https://app.fireflies.ai/integrations)** → **[Fireflies API](https://app.fireflies.ai/integrations/custom/fireflies)**.
2. Copy the API key.
3. In your project root, add to **`.env.local`** (create the file if needed):

   ```bash
   FIREFLIES_API_KEY=your_key_here
   ```

4. **Restart** `npm run dev` (or redeploy on Vercel with the env var set) so the server picks up the key.

### C. Transcript ID (what you paste in admin)

1. Open the processed meeting in the Fireflies web app.
2. The **transcript ID** is usually the identifier Fireflies uses for that recording — often visible in the **browser URL** when viewing that transcript (a long id string), or in share / details. If unsure, check Fireflies help for “transcript id” for the current UI.
3. In **your** admin: open the candidate → set status to **In interview** or **Offer** if needed → in **Interview transcript & notes**, paste that id → **Import from Fireflies**.

### D. If import fails

- Confirm `FIREFLIES_API_KEY` is set and the dev server was restarted.
- Free plans may enforce **API rate limits** (e.g. a small number of calls per day); retry later or upgrade if you hit limits.
- Use **Load mock transcript** to verify the admin UI and database without Fireflies.

## Mock

`Load mock transcript` — no external keys; tests DB + admin UI.

## Env

- **`ASSEMBLYAI_API_KEY`** — recommended for free transcription (URL or small upload).
- **`FIREFLIES_API_KEY`** — optional; Fireflies import only.
