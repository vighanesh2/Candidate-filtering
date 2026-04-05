import { AssemblyAI } from "assemblyai";
import { supabaseAdmin } from "./supabase";

const FIREFLIES_GQL = "https://api.fireflies.ai/graphql";

export type InterviewTranscriptRow = {
  id: string;
  application_id: string;
  provider: string;
  external_id: string | null;
  title: string | null;
  transcript: string | null;
  summary: string | null;
  action_items: unknown;
  created_at: string;
};

type FirefliesSentence = {
  index?: number;
  text?: string;
  speaker_name?: string;
  start_time?: number;
  end_time?: number;
};

type FirefliesSummary = {
  overview?: string;
  short_summary?: string;
  gist?: string;
  bullet_gist?: string;
  action_items?: unknown;
};

type FirefliesTranscriptPayload = {
  id?: string;
  title?: string;
  dateString?: string;
  host_email?: string;
  participants?: string[];
  sentences?: FirefliesSentence[] | null;
  summary?: FirefliesSummary | null;
};

const FETCH_TRANSCRIPT_QUERY = `
query Phase04Transcript($id: String!) {
  transcript(id: $id) {
    id
    title
    dateString
    host_email
    participants
    sentences {
      index
      text
      speaker_name
      start_time
      end_time
    }
    summary {
      overview
      short_summary
      gist
      bullet_gist
      action_items
    }
  }
}
`;

function sentencesToPlainText(sentences: FirefliesSentence[] | null | undefined): string {
  if (!sentences?.length) return "";
  const sorted = [...sentences].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  return sorted
    .map((s) => {
      const who = s.speaker_name ? `${s.speaker_name}: ` : "";
      return `${who}${(s.text ?? "").trim()}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function pickSummary(s: FirefliesSummary | null | undefined): string {
  if (!s) return "";
  return (
    [s.overview, s.short_summary, s.gist, s.bullet_gist].find(
      (x) => typeof x === "string" && x.trim().length > 0
    ) ?? ""
  );
}

function normalizeActionItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
}

export async function fetchFirefliesTranscript(
  transcriptId: string
): Promise<FirefliesTranscriptPayload> {
  const key = process.env.FIREFLIES_API_KEY?.trim();
  if (!key) {
    throw new Error("FIREFLIES_API_KEY is not set");
  }

  const res = await fetch(FIREFLIES_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: FETCH_TRANSCRIPT_QUERY,
      variables: { id: transcriptId },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const json = (await res.json()) as {
    data?: { transcript?: FirefliesTranscriptPayload | null };
    errors?: { message: string }[];
  };

  if (!res.ok) {
    throw new Error(`Fireflies HTTP ${res.status}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  const t = json.data?.transcript;
  if (!t?.id) {
    throw new Error("Transcript not found or not accessible with this API key");
  }
  return t;
}

export function buildMockTranscriptPayload(applicationName: string): {
  title: string;
  transcript: string;
  summary: string;
  action_items: string[];
  raw: Record<string, unknown>;
} {
  return {
    title: `Mock interview — ${applicationName}`,
    transcript: [
      `[Interviewer] Thanks for joining. Let's start with your background on the role.`,
      `[${applicationName}] I led the scheduling product team at my last company and shipped calendar integrations with Google and Microsoft.`,
      `[Interviewer] How do you handle conflicting priorities when engineering wants to cut scope?`,
      `[${applicationName}] I align on a single success metric for the release and negotiate a phased rollout so we keep trust with customers.`,
      `[Interviewer] Any questions for us?`,
      `[${applicationName}] I'd love to hear how you're thinking about AI-assisted workflows for candidates.`,
    ].join("\n\n"),
    summary:
      "Strong ownership examples and clear tradeoff framing. Discussed calendar integrations (relevant to scheduling). Open questions on AI roadmap — good culture fit signal. **Mock data** — replace with Fireflies import for real interviews.",
    action_items: [
      "Send take-home or system design (optional)",
      "Loop in hiring manager for final round",
    ],
    raw: { mock: true, phase: "04" },
  };
}

export async function saveInterviewTranscript(params: {
  applicationId: string;
  provider: "assemblyai" | "fireflies" | "mock" | "manual";
  externalId?: string | null;
  title?: string | null;
  transcript: string;
  summary: string;
  actionItems: unknown[];
  rawPayload?: Record<string, unknown> | null;
}): Promise<InterviewTranscriptRow> {
  const { data, error } = await supabaseAdmin
    .from("interview_transcripts")
    .insert({
      application_id: params.applicationId,
      provider: params.provider,
      external_id: params.externalId ?? null,
      title: params.title ?? null,
      transcript: params.transcript,
      summary: params.summary,
      action_items: params.actionItems,
      raw_payload: params.rawPayload ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as InterviewTranscriptRow;
}

export async function ingestFirefliesTranscriptForApplication(
  applicationId: string,
  firefliesTranscriptId: string
): Promise<InterviewTranscriptRow> {
  const t = await fetchFirefliesTranscript(firefliesTranscriptId);
  const transcript = sentencesToPlainText(t.sentences ?? []);
  const summary = pickSummary(t.summary ?? undefined);
  const actionItems = normalizeActionItems(t.summary?.action_items);

  return saveInterviewTranscript({
    applicationId,
    provider: "fireflies",
    externalId: t.id ?? firefliesTranscriptId,
    title: t.title ?? null,
    transcript: transcript || "(No sentences returned — check Fireflies processing.)",
    summary: summary || "(No summary returned.)",
    actionItems,
    rawPayload: t as unknown as Record<string, unknown>,
  });
}

export async function ingestMockTranscriptForApplication(
  applicationId: string,
  candidateName: string
): Promise<InterviewTranscriptRow> {
  const m = buildMockTranscriptPayload(candidateName);
  return saveInterviewTranscript({
    applicationId,
    provider: "mock",
    externalId: null,
    title: m.title,
    transcript: m.transcript,
    summary: m.summary,
    actionItems: m.action_items,
    rawPayload: m.raw,
  });
}

function isAllowedAudioUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Transcribe a recording via AssemblyAI (large free developer tier — see assemblyai.com/pricing).
 * Pass a **publicly reachable** audio/video URL (recommended on Vercel due to request body size limits).
 */
export async function ingestAssemblyAIFromUrl(
  applicationId: string,
  audioUrl: string,
  candidateName: string
): Promise<InterviewTranscriptRow> {
  const trimmed = audioUrl.trim();
  if (!isAllowedAudioUrl(trimmed)) {
    throw new Error("assemblyAudioUrl must be a valid http(s) URL");
  }

  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set — create a free account at https://www.assemblyai.com/dashboard"
    );
  }

  const client = new AssemblyAI({ apiKey: key });

  const transcript = await client.transcripts.transcribe(
    {
      audio: trimmed,
      speaker_labels: true,
    },
    { pollingTimeout: 300_000 }
  );

  if (transcript.status === "error") {
    throw new Error(
      typeof transcript.error === "string"
        ? transcript.error
        : "AssemblyAI transcription failed"
    );
  }

  const rawText = transcript.text?.trim() ?? "";
  let body = rawText;
  if (transcript.utterances && transcript.utterances.length > 0) {
    body = transcript.utterances
      .map((u) => {
        const label = u.speaker != null ? `Speaker ${u.speaker}` : "Speaker";
        return `${label}: ${u.text ?? ""}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const summary =
    rawText.length > 600
      ? `${rawText.slice(0, 600).trim()}…`
      : rawText || "No speech detected in this file.";

  return saveInterviewTranscript({
    applicationId,
    provider: "assemblyai",
    externalId: transcript.id ?? null,
    title: `Interview recording — ${candidateName}`,
    transcript: body || rawText || "(empty)",
    summary,
    actionItems: [],
    rawPayload: {
      assemblyai_id: transcript.id,
      audio_duration: transcript.audio_duration,
      audio_url: transcript.audio_url,
    },
  });
}

/** Local / small uploads: pass raw bytes (keep under a few MB on Vercel). */
export async function ingestAssemblyAIFromBuffer(
  applicationId: string,
  audio: ArrayBuffer,
  candidateName: string,
  originalFilename: string
): Promise<InterviewTranscriptRow> {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set — create a free account at https://www.assemblyai.com/dashboard"
    );
  }

  const client = new AssemblyAI({ apiKey: key });

  const transcript = await client.transcripts.transcribe(
    {
      audio: Buffer.from(audio),
      speaker_labels: true,
    },
    { pollingTimeout: 300_000 }
  );

  if (transcript.status === "error") {
    throw new Error(
      typeof transcript.error === "string"
        ? transcript.error
        : "AssemblyAI transcription failed"
    );
  }

  const rawText = transcript.text?.trim() ?? "";
  let body = rawText;
  if (transcript.utterances && transcript.utterances.length > 0) {
    body = transcript.utterances
      .map((u) => {
        const label = u.speaker != null ? `Speaker ${u.speaker}` : "Speaker";
        return `${label}: ${u.text ?? ""}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const summary =
    rawText.length > 600
      ? `${rawText.slice(0, 600).trim()}…`
      : rawText || "No speech detected in this file.";

  return saveInterviewTranscript({
    applicationId,
    provider: "assemblyai",
    externalId: transcript.id ?? null,
    title: `Interview recording — ${candidateName} (${originalFilename})`,
    transcript: body || rawText || "(empty)",
    summary,
    actionItems: [],
    rawPayload: {
      assemblyai_id: transcript.id,
      audio_duration: transcript.audio_duration,
      source: "upload",
    },
  });
}

export async function listInterviewTranscripts(
  applicationId: string
): Promise<InterviewTranscriptRow[]> {
  const { data, error } = await supabaseAdmin
    .from("interview_transcripts")
    .select(
      "id, application_id, provider, external_id, title, transcript, summary, action_items, created_at"
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as InterviewTranscriptRow[];
}
