import crypto from "crypto";
import { Resend } from "resend";
import { jobs } from "./jobs";
import { supabaseAdmin } from "./supabase";
import { callAnthropicMessages } from "./claude-client";
import type { OfferLetterQuestionnaire } from "./offer-letter";
import type { ResearchProfile } from "./research";

const resend = new Resend(process.env.RESEND_API_KEY!);

const SLACK_API = "https://slack.com/api/";

type SlackApiOk = { ok: boolean; error?: string };

async function slackPost(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  const res = await fetch(`${SLACK_API}${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export function verifySlackSigningSecret(
  rawBody: string,
  timestamp: string | null,
  slackSignature: string | null,
  signingSecret: string
): boolean {
  if (!timestamp || !slackSignature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) {
    return false;
  }
  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" + crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(slackSignature, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseResourceUrls(): { label: string; url: string }[] {
  const raw = process.env.SLACK_ONBOARDING_RESOURCE_URLS?.trim() ?? "";
  if (!raw) return [];
  const out: { label: string; url: string }[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const pipe = s.indexOf("|");
    if (pipe > 0) {
      out.push({ label: s.slice(0, pipe).trim(), url: s.slice(pipe + 1).trim() });
    } else {
      out.push({ label: s.replace(/^https?:\/\//, "").slice(0, 40), url: s });
    }
  }
  return out.filter((x) => x.url.startsWith("http"));
}

/**
 * Optional: Slack Enterprise Grid `admin.users.invite`. Most workspaces use email + shared invite link instead.
 */
export async function trySlackAdminUserInvite(candidateEmail: string, fullName: string): Promise<boolean> {
  if (process.env.SLACK_ENABLE_ADMIN_INVITE?.trim() !== "true") return false;

  const teamId = process.env.SLACK_TEAM_ID?.trim();
  const channelIds = process.env.SLACK_INVITE_CHANNEL_IDS?.trim();
  if (!teamId || !channelIds) {
    console.warn("[slack] SLACK_ENABLE_ADMIN_INVITE=true but SLACK_TEAM_ID or SLACK_INVITE_CHANNEL_IDS missing.");
    return false;
  }

  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? fullName;
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "_";

  const json = (await slackPost("admin.users.invite", {
    team_id: teamId,
    email: candidateEmail.trim(),
    channel_ids: channelIds,
    first_name: first.slice(0, 80),
    last_name: last.slice(0, 80),
    real_name: fullName.slice(0, 160),
  })) as SlackApiOk & { email_already_in_team?: boolean };

  if (json.ok || json.email_already_in_team) return true;
  console.error("[slack] admin.users.invite failed:", json.error);
  return false;
}

export async function sendSlackInviteEmail(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  startDate: string;
  inviteUrl: string;
  adminInviteAttempted: boolean;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required for the Slack invite email.");
  }

  const extra = params.adminInviteAttempted
    ? "\nIf your workspace uses Slack’s email invite, you may also receive an invitation directly from Slack.\n"
    : "\n";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: params.candidateEmail,
    subject: `Join our Slack — ${params.jobTitle} onboarding`,
    text: `Hi ${params.candidateName},

Welcome aboard! Your offer is signed — the next step is to join the team on Slack.

Role: ${params.jobTitle}
Start date (from your offer): ${params.startDate}

Use this link to join our Slack workspace:
${params.inviteUrl}
${extra}
After you join, our onboarding assistant will send you a personalized welcome message in Slack with next steps.

If the link expires, reply to this thread and we’ll send a fresh one.

Best,
The Team`,
  });
}

export async function kickOffSlackOnboardingAfterOfferSigned(params: {
  applicationId: string;
  candidateEmail: string;
  fullName: string;
  roleId: string;
  questionnaire: OfferLetterQuestionnaire;
}): Promise<void> {
  const inviteUrl = process.env.SLACK_WORKSPACE_INVITE_URL?.trim();
  if (!inviteUrl) {
    console.warn(
      "[slack] SLACK_WORKSPACE_INVITE_URL not set — skipping Slack invite email (set URL from Slack → Invite people)."
    );
    return;
  }

  const job = jobs.find((j) => j.id === params.roleId);
  const jobTitle = params.questionnaire.job_title?.trim() || job?.title || "your role";
  const startDate = params.questionnaire.start_date?.trim() || "TBD";

  let adminOk = false;
  try {
    adminOk = await trySlackAdminUserInvite(params.candidateEmail, params.fullName);
  } catch (e) {
    console.error("[slack] Admin invite error:", e instanceof Error ? e.message : e);
  }

  await sendSlackInviteEmail({
    candidateEmail: params.candidateEmail,
    candidateName: params.fullName,
    jobTitle,
    startDate,
    inviteUrl,
    adminInviteAttempted: adminOk,
  });

  const now = new Date().toISOString();
  const method = adminOk ? "both" : "email_link";

  await supabaseAdmin
    .from("offer_letters")
    .update({
      slack_invite_sent_at: now,
      slack_invite_method: method,
      updated_at: now,
    })
    .eq("application_id", params.applicationId);
}

type SlackUserInfo = {
  user?: {
    id?: string;
    profile?: { email?: string; real_name?: string };
  };
};

export async function fetchSlackUserEmail(userId: string): Promise<string | null> {
  const json = (await slackPost("users.info", { user: userId })) as SlackUserInfo & SlackApiOk;
  if (!json.ok) {
    console.error("[slack] users.info failed:", (json as SlackApiOk).error);
    return null;
  }
  const email = json.user?.profile?.email?.trim().toLowerCase();
  return email || null;
}

async function openIm(userId: string): Promise<string | null> {
  const json = (await slackPost("conversations.open", { users: userId })) as {
    ok?: boolean;
    channel?: { id?: string };
    error?: string;
  };
  if (!json.ok) {
    console.error("[slack] conversations.open failed:", json.error);
    return null;
  }
  return json.channel?.id ?? null;
}

export async function postSlackMessage(channel: string, text: string): Promise<boolean> {
  const json = (await slackPost("chat.postMessage", {
    channel,
    text,
    mrkdwn: true,
  })) as SlackApiOk;
  if (!json.ok) {
    console.error("[slack] chat.postMessage failed:", json.error);
    return false;
  }
  return true;
}

export async function generateSlackWelcomeMessageAi(params: {
  candidateName: string;
  jobTitle: string;
  startDate: string;
  reportingManager: string;
  resourceLinks: { label: string; url: string }[];
  profileHints: string;
}): Promise<string> {
  const linksBlock =
    params.resourceLinks.length > 0
      ? params.resourceLinks.map((l, i) => `${i + 1}. ${l.label}: ${l.url}`).join("\n")
      : "(No URLs configured — suggest generic first-week tips only.)";

  const prompt = `You are writing a single Slack direct message to a new hire. Output plain text suitable for Slack mrkdwn:
- Use *bold* sparingly for key terms, bullets with • or -, short paragraphs.
- Address them by first name (infer from: ${params.candidateName}).
- Must include ALL of: their role (${params.jobTitle}), start date (${params.startDate}), a warm sentence that sounds like a personal greeting from their manager (${params.reportingManager}) — do not use a generic "the team" only; name the manager.
- Incorporate 1–2 sentences personalized using ONLY these profile hints (if empty, skip personalization): ${params.profileHints || "none"}.
- End with a clear "Helpful links" section using exactly these entries (keep labels friendly):
${linksBlock}
- Do not use a subject line. Do not wrap in code fences. Keep under 450 words.`;

  return callAnthropicMessages({
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
}

export async function handleSlackTeamJoinEvent(userId: string): Promise<void> {
  const hrChannel = process.env.SLACK_HR_CHANNEL_ID?.trim();
  if (!hrChannel) {
    console.warn("[slack] SLACK_HR_CHANNEL_ID not set — HR notification skipped.");
  }

  const email = await fetchSlackUserEmail(userId);
  if (!email) return;

  const norm = email.trim().toLowerCase();

  const { data: app, error: appErr } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, research_profile")
    .ilike("email", norm)
    .maybeSingle();

  if (appErr || !app) return;

  const { data: olRows, error: olErr } = await supabaseAdmin
    .from("offer_letters")
    .select("id, questionnaire, signed_at")
    .eq("application_id", app.id as string)
    .not("signed_at", "is", null)
    .is("slack_welcome_sent_at", null)
    .order("signed_at", { ascending: false })
    .limit(1);

  if (olErr || !olRows?.length) return;

  const row = olRows[0] as { id: string; questionnaire: OfferLetterQuestionnaire };

  const q = row.questionnaire;
  const job = jobs.find((j) => j.id === app.role_id);

  const rp = app.research_profile as ResearchProfile | null | undefined;
  const profileHints = [
    rp?.candidate_brief?.slice(0, 600),
    job ? `Team: ${job.team}, level: ${job.level}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resources = parseResourceUrls();
  let welcome: string;
  try {
    welcome = await generateSlackWelcomeMessageAi({
      candidateName: app.full_name,
      jobTitle: q.job_title?.trim() || job?.title || "your role",
      startDate: q.start_date?.trim() || "TBD",
      reportingManager: q.reporting_manager?.trim() || "your manager",
      resourceLinks: resources,
      profileHints,
    });
  } catch (e) {
    console.error("[slack] AI welcome failed:", e instanceof Error ? e.message : e);
    return;
  }

  const dmChannel = await openIm(userId);
  if (!dmChannel) return;

  const posted = await postSlackMessage(dmChannel, welcome);
  if (!posted) return;

  const now = new Date().toISOString();

  const { data: updatedRows, error: upErr } = await supabaseAdmin
    .from("offer_letters")
    .update({
      slack_user_id: userId,
      slack_welcome_sent_at: now,
      slack_welcome_message: welcome,
      updated_at: now,
    })
    .eq("id", row.id)
    .is("slack_welcome_sent_at", null)
    .select("id");

  if (upErr || !updatedRows?.length) {
    return;
  }

  if (hrChannel) {
    const hrText = `*Onboarding complete (Slack)*\n${app.full_name} (\`${app.email}\`) joined the workspace. Personalized welcome DM sent. Role: ${q.job_title || job?.title || "—"}.`;
    const hrOk = await postSlackMessage(hrChannel, hrText);
    if (hrOk) {
      await supabaseAdmin
        .from("offer_letters")
        .update({ slack_hr_notified_at: now, updated_at: now })
        .eq("id", row.id as string);
    }
  }
}
