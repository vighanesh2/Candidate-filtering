import { callAnthropicMessages } from "./claude-client";
import type { Job } from "./jobs";
import type { AIParsed } from "./screen";
import type { ResearchProfile } from "./research";

export type OfferLetterQuestionnaire = {
  job_title: string;
  start_date: string;
  base_salary: string;
  compensation_structure: string;
  equity_bonus: string;
  reporting_manager: string;
  custom_terms: string;
};

export type OfferSignatureMethod = "typed" | "drawn";

export type OfferLetterRow = {
  id: string;
  application_id: string;
  questionnaire: OfferLetterQuestionnaire;
  draft_body: string;
  review_status: "draft" | "approved" | "sent";
  created_at: string;
  updated_at: string;
  /** Phase 5B — null until hiring sends signing link */
  signing_token: string | null;
  signing_email_sent_at: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signature_method: OfferSignatureMethod | null;
  /** Typed full legal name or data-URL PNG for drawn signature */
  signature_captured: string | null;
  signer_user_agent: string | null;
};

export function mapOfferLetterRowFromDb(data: Record<string, unknown>): OfferLetterRow {
  const method = data.signature_method as string | null | undefined;
  const sigMethod: OfferSignatureMethod | null =
    method === "typed" || method === "drawn" ? method : null;

  return {
    id: data.id as string,
    application_id: data.application_id as string,
    questionnaire: data.questionnaire as OfferLetterQuestionnaire,
    draft_body: (data.draft_body as string) ?? "",
    review_status: data.review_status as OfferLetterRow["review_status"],
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    signing_token: (data.signing_token as string) ?? null,
    signing_email_sent_at: (data.signing_email_sent_at as string) ?? null,
    signed_at: (data.signed_at as string) ?? null,
    signer_ip: (data.signer_ip as string) ?? null,
    signature_method: sigMethod,
    signature_captured: (data.signature_captured as string) ?? null,
    signer_user_agent: (data.signer_user_agent as string) ?? null,
  };
}

const REQUIRED_KEYS: (keyof OfferLetterQuestionnaire)[] = [
  "job_title",
  "start_date",
  "base_salary",
  "compensation_structure",
  "reporting_manager",
];

export function parseQuestionnaire(input: Record<string, unknown>): OfferLetterQuestionnaire {
  const str = (k: keyof OfferLetterQuestionnaire) =>
    String(input[k] ?? "").trim();

  return {
    job_title: str("job_title"),
    start_date: str("start_date"),
    base_salary: str("base_salary"),
    compensation_structure: str("compensation_structure"),
    equity_bonus: str("equity_bonus"),
    reporting_manager: str("reporting_manager"),
    custom_terms: str("custom_terms"),
  };
}

export function validateQuestionnaire(q: OfferLetterQuestionnaire): string | null {
  for (const key of REQUIRED_KEYS) {
    if (!q[key]?.trim()) {
      return `Missing required field: ${key.replace(/_/g, " ")}`;
    }
  }
  return null;
}

function useLavaSafeMode(): boolean {
  return !process.env.ANTHROPIC_API_KEY?.trim();
}

function buildCandidateContext(params: {
  fullName: string;
  email: string;
  linkedinUrl: string;
  portfolioUrl: string | null;
  aiParsed: AIParsed | null;
  researchBrief: string | null;
}): string {
  const parts: string[] = [
    `Candidate name: ${params.fullName}`,
    `Email: ${params.email}`,
    `LinkedIn: ${params.linkedinUrl}`,
  ];
  if (params.portfolioUrl) parts.push(`Portfolio: ${params.portfolioUrl}`);

  if (params.aiParsed) {
    parts.push(
      `Role-relevant profile (from screening): experience ${params.aiParsed.experience_years} years; education: ${params.aiParsed.education}; skills: ${params.aiParsed.skills.slice(0, 12).join(", ")}; employers: ${params.aiParsed.employers.slice(0, 5).join(", ")}`
    );
  }

  if (params.researchBrief?.trim()) {
    const max = useLavaSafeMode() ? 1200 : 3500;
    let brief = params.researchBrief.trim();
    if (brief.length > max) brief = `${brief.slice(0, max)}…`;
    parts.push(`Research brief:\n${brief}`);
  }

  return parts.join("\n");
}

function buildOfferPrompt(params: {
  companyName: string;
  job: Job;
  questionnaire: OfferLetterQuestionnaire;
  candidateContext: string;
}): string {
  const { companyName, job, questionnaire, candidateContext } = params;
  const equity =
    questionnaire.equity_bonus.trim() ||
    "None specified — use neutral language or omit equity/bonus section.";
  const custom =
    questionnaire.custom_terms.trim() ||
    "None — use standard professional language only.";

  return `You are an experienced HR and employment counsel assistant. Write a complete, formal offer letter suitable for ${companyName}.

Output rules:
- Use clear sections (e.g. Position, Start date, Compensation, Reporting, Equity/bonus if applicable, Additional terms, Acceptance).
- Address the candidate by full name in the salutation.
- Use the exact compensation figures and dates provided by the hiring manager — do not invent numbers.
- Tone: professional, warm, precise. No markdown code fences; plain text with line breaks is fine.
- If the legal entity name is unknown, use "${companyName}" as the employer name.
- End with a standard acceptance / signature block (candidate signature line and date; company signature line placeholder).
- Do not include disclaimers like "this is not legal advice" inside the letter body; keep the letter itself clean.

Role context (from internal job catalog — team/location/level for flavor only; confirmed title below overrides):
- Catalog title: ${job.title}
- Team: ${job.team}
- Location type: ${job.remote}
- Level: ${job.level}

Hiring manager inputs (authoritative):
- Confirmed job title: ${questionnaire.job_title}
- Start date: ${questionnaire.start_date}
- Base salary: ${questionnaire.base_salary}
- Compensation structure (pay frequency, etc.): ${questionnaire.compensation_structure}
- Equity or bonus: ${equity}
- Reporting manager: ${questionnaire.reporting_manager}
- Custom terms or conditions for this candidate: ${custom}

Candidate profile (for personalization only — do not contradict hiring manager inputs):
${candidateContext}

Write the full offer letter now.`;
}

export async function generateOfferLetterDraft(params: {
  companyName: string;
  job: Job;
  questionnaire: OfferLetterQuestionnaire;
  fullName: string;
  email: string;
  linkedinUrl: string;
  portfolioUrl: string | null;
  aiParsed: AIParsed | null;
  researchProfile: ResearchProfile | null;
}): Promise<string> {
  const researchBrief = params.researchProfile?.candidate_brief ?? null;
  const candidateContext = buildCandidateContext({
    fullName: params.fullName,
    email: params.email,
    linkedinUrl: params.linkedinUrl,
    portfolioUrl: params.portfolioUrl,
    aiParsed: params.aiParsed,
    researchBrief,
  });

  const prompt = buildOfferPrompt({
    companyName: params.companyName,
    job: params.job,
    questionnaire: params.questionnaire,
    candidateContext,
  });

  const safe = useLavaSafeMode();
  const text = await callAnthropicMessages({
    max_tokens: safe ? 2500 : 6000,
    messages: [{ role: "user", content: prompt }],
  });

  return text.trim();
}
