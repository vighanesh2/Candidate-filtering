import mammoth from "mammoth";
import { jobs } from "./jobs";
import { supabaseAdmin } from "./supabase";

const THRESHOLD = Number(process.env.AI_SHORTLIST_THRESHOLD ?? 70);
// Lava proxies to Anthropic via ?u= query param
const LAVA_URL = "https://api.lavapayments.com/v1/forward?u=https://api.anthropic.com/v1/messages";

export type AIParsed = {
  skills: string[];
  experience_years: number;
  education: string;
  employers: string[];
  achievements: string[];
};

export type StatusHistoryEntry = {
  status: string;
  note: string | null;
  changed_at: string;
  is_override: boolean;
};

async function callClaude(body: object): Promise<string> {
  const token = process.env.LAVA_FORWARD_TOKEN!;
  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Lava API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // Anthropic response shape: { content: [{ type: "text", text: "..." }] }
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error(`Unexpected Lava response shape: ${JSON.stringify(data)}`);
  return text.trim();
}

async function buildMessages(
  resumeBytes: ArrayBuffer,
  mimeType: string,
  prompt: string
): Promise<object[]> {
  if (mimeType === "application/pdf") {
    const base64 = Buffer.from(resumeBytes).toString("base64");
    return [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ];
  }

  // DOCX — extract plain text with mammoth
  const { value: text } = await mammoth.extractRawText({ buffer: Buffer.from(resumeBytes) });
  return [{ role: "user", content: `RESUME:\n${text}\n\n${prompt}` }];
}

export async function screenCandidate({
  applicationId,
  roleId,
  resumeBytes,
  mimeType,
}: {
  applicationId: string;
  roleId: string;
  resumeBytes: ArrayBuffer;
  mimeType: string;
}) {
  console.log("[screen] Starting for", applicationId, "role:", roleId, "mime:", mimeType, "bytes:", resumeBytes.byteLength);
  const job = jobs.find((j) => j.id === roleId);
  if (!job) { console.error("[screen] Job not found:", roleId); return; }

  const jd = [
    `Role: ${job.title} (${job.level})`,
    `Team: ${job.team}`,
    `Location: ${job.location} (${job.remote})`,
    `\nResponsibilities:\n${job.responsibilities.map((r) => `- ${r}`).join("\n")}`,
    `\nRequirements:\n${job.requirements.map((r) => `- ${r}`).join("\n")}`,
    job.niceToHave
      ? `\nNice to Have:\n${job.niceToHave.map((r) => `- ${r}`).join("\n")}`
      : "",
  ].join("\n");

  const prompt = `You are a senior technical recruiter. Analyze the resume against this job description and return ONLY valid JSON — no markdown, no explanation.

JOB DESCRIPTION:
${jd}

Return exactly this JSON shape:
{
  "skills": ["skill1", "skill2"],
  "experience_years": 4,
  "education": "B.S. Computer Science, Stanford University",
  "employers": ["Company A", "Company B"],
  "achievements": ["Led migration that reduced latency by 40%", "..."],
  "score": 78,
  "rationale": "2–3 sentences covering overall fit, key strengths, and notable gaps."
}`;

  const messages = await buildMessages(resumeBytes, mimeType, prompt);

  const raw = await callClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages,
  });

  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  const result = JSON.parse(cleaned);

  const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
  const newStatus = score >= THRESHOLD ? "shortlisted" : "screened";

  const { data: current } = await supabaseAdmin
    .from("applications")
    .select("status_history")
    .eq("id", applicationId)
    .single();

  const history: StatusHistoryEntry[] = [
    ...((current?.status_history as StatusHistoryEntry[]) ?? []),
    { status: newStatus, note: null, changed_at: new Date().toISOString(), is_override: false },
  ];

  const aiParsed: AIParsed = {
    skills: result.skills ?? [],
    experience_years: Number(result.experience_years) || 0,
    education: result.education ?? "",
    employers: result.employers ?? [],
    achievements: result.achievements ?? [],
  };

  await supabaseAdmin
    .from("applications")
    .update({
      ai_score: score,
      ai_rationale: result.rationale ?? "",
      ai_parsed: aiParsed,
      ai_screened_at: new Date().toISOString(),
      status: newStatus,
      status_history: history,
    })
    .eq("id", applicationId);

  console.log(`[screen] ${applicationId} → score ${score} → ${newStatus}`);
}
