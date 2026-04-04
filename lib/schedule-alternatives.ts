import crypto from "crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "./supabase";
import { jobs } from "./jobs";
import {
  findFreeSlots,
  createTentativeHold,
  deleteEvent,
  type CalendarSlot,
} from "./calendar";
import { getTentativeHoldSlotsForInterviewer } from "./scheduling-holds";
import { callAnthropicMessages } from "./claude-client";

const resend = new Resend(process.env.RESEND_API_KEY!);

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

type SlotJson = { start: string; end: string };

async function findAlternativeSlotPool(
  interviewerEmail: string,
  applicationId: string,
  excludeRanges: { start: Date; end: Date }[]
): Promise<CalendarSlot[]> {
  const globalHolds = await getTentativeHoldSlotsForInterviewer(interviewerEmail);
  const { data: appSlots } = await supabaseAdmin
    .from("interview_slots")
    .select("start_time, end_time")
    .eq("application_id", applicationId)
    .eq("status", "tentative");

  const ownRanges = (appSlots ?? []).map((r) => ({
    start: new Date(r.start_time as string),
    end: new Date(r.end_time as string),
  }));

  const merged: CalendarSlot[] = [
    ...globalHolds,
    ...excludeRanges.map((r) => ({ start: r.start, end: r.end })),
    ...ownRanges,
  ];

  return findFreeSlots(interviewerEmail, 12, { extraBusy: merged, businessDays: 10 });
}

async function rankAlternativesWithAI(
  pool: CalendarSlot[],
  note: string,
  jobTitle: string,
  candidateName: string
): Promise<CalendarSlot[]> {
  if (pool.length <= 3) return pool;
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.LAVA_FORWARD_TOKEN?.trim()) {
    return pool;
  }
  try {
    const lines = pool
      .map(
        (s, i) =>
          `${i + 1}. ${s.start.toISOString()} – ${s.end.toISOString()} (${s.start.toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })})`
      )
      .join("\n");
    const raw = await callAnthropicMessages({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `You are helping schedule interviews. Pick the 3 best slots for this candidate from the numbered list only.

Candidate: ${candidateName}
Role: ${jobTitle}
Candidate availability note: ${note.trim() || "none"}

Slots:
${lines}

Reply with ONLY valid JSON: {"indices":[n1,n2,n3]} using 1-based indices from the list, ordered best first. Prefer business-hours variety.`,
        },
      ],
    });
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { indices?: number[] };
    const idx = (parsed.indices ?? [])
      .map((n) => n - 1)
      .filter((i) => i >= 0 && i < pool.length);
    const picked = idx.map((i) => pool[i]).filter(Boolean);
    if (picked.length >= 3) return picked;
  } catch {
    /* use chronological fallback */
  }
  return pool;
}

export async function requestAlternativeTimes(token: string, candidateNote: string): Promise<void> {
  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, status, scheduling_token")
    .eq("scheduling_token", token)
    .single();

  if (error || !app) throw new Error("Invalid link");
  if (app.status !== "scheduling_sent") {
    throw new Error("Scheduling is not open for alternative requests.");
  }

  const { data: pending } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("id")
    .eq("application_id", app.id)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) throw new Error("An alternative time request is already being reviewed.");

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) throw new Error("Job not found");

  const historic = await loadHistoricProposedRanges(app.id as string);
  const pool = await findAlternativeSlotPool(job.interviewerEmail, app.id as string, historic);
  const ranked = await rankAlternativesWithAI(
    pool,
    candidateNote,
    job.title,
    app.full_name as string
  );

  if (ranked.length < 3) {
    throw new Error(
      "Not enough open slots for alternatives right now — please contact the hiring team."
    );
  }

  const top3 = ranked.slice(0, 3);
  const proposalToken = crypto.randomBytes(24).toString("hex");
  const proposed_slots: SlotJson[] = top3.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));

  await supabaseAdmin.from("scheduling_alternative_proposals").insert({
    application_id: app.id,
    interviewer_email: job.interviewerEmail,
    token: proposalToken,
    candidate_note: candidateNote.trim() || null,
    proposed_slots,
    status: "pending",
  });

  await supabaseAdmin
    .from("applications")
    .update({ scheduling_awaiting_alternatives: true })
    .eq("id", app.id);

  const lines = top3
    .map((s, i) => {
      const d = new Date(s.start);
      return `Option ${i + 1}: ${d.toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
    })
    .join("\n");

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: job.interviewerEmail,
    subject: `Approve alternative interview slots for ${app.full_name}`,
    text: `${app.full_name} requested different interview times.

Candidate note:
${candidateNote.trim() || "(none)"}

Proposed new slots (holds stay on current options until you approve):
${lines}

Open to approve or decline:
${baseUrl()}/schedule/interviewer/${proposalToken}

— JobApp scheduling`,
  });

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: app.email as string,
    subject: `We received your scheduling request`,
    text: `Hi ${app.full_name},

We received your request for different interview times. Your current options remain on hold until the team confirms new times — you can still pick one of the original slots while we review.

We'll email you when new times are ready.

— The Hiring Team`,
  });
}

async function loadHistoricProposedRanges(applicationId: string): Promise<{ start: Date; end: Date }[]> {
  const { data: rows } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("proposed_slots, status")
    .eq("application_id", applicationId);

  const out: { start: Date; end: Date }[] = [];
  for (const pr of rows ?? []) {
    if (pr.status === "pending") continue;
    const slots = pr.proposed_slots as SlotJson[] | null;
    if (!slots) continue;
    for (const s of slots) {
      out.push({ start: new Date(s.start), end: new Date(s.end) });
    }
  }
  return out;
}

export async function approveAlternativeProposal(proposalToken: string): Promise<void> {
  const { data: proposal, error } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("*")
    .eq("token", proposalToken)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !proposal) throw new Error("Proposal not found or already processed.");

  const appId = proposal.application_id as string;
  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, scheduling_token")
    .eq("id", appId)
    .single();

  if (!app) throw new Error("Application not found");

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) throw new Error("Job not found");

  const { data: oldSlots } = await supabaseAdmin
    .from("interview_slots")
    .select("id, google_event_id, interviewer_email")
    .eq("application_id", appId)
    .eq("status", "tentative");

  for (const o of oldSlots ?? []) {
    if (o.google_event_id) {
      await deleteEvent(o.interviewer_email as string, o.google_event_id as string);
    }
    await supabaseAdmin
      .from("interview_slots")
      .update({ status: "cancelled" })
      .eq("id", o.id as string);
  }

  const batchId = crypto.randomUUID();
  const proposed = proposal.proposed_slots as SlotJson[];
  const savedIds: string[] = [];

  for (const p of proposed) {
    const slot = { start: new Date(p.start), end: new Date(p.end) };
    const eventId = await createTentativeHold(
      proposal.interviewer_email as string,
      slot,
      app.full_name as string
    );
    const { data: row } = await supabaseAdmin
      .from("interview_slots")
      .insert({
        application_id: appId,
        interviewer_email: proposal.interviewer_email,
        start_time: slot.start.toISOString(),
        end_time: slot.end.toISOString(),
        google_event_id: eventId,
        status: "tentative",
        offer_batch_id: batchId,
      })
      .select("id")
      .single();
    if (row?.id) savedIds.push(row.id as string);
  }

  await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .update({ status: "approved" })
    .eq("id", proposal.id as string);

  await supabaseAdmin
    .from("applications")
    .update({ scheduling_awaiting_alternatives: false })
    .eq("id", appId);

  const slotLines = proposed.map((p, i) => {
    const start = new Date(p.start);
    const sid = savedIds[i];
    const link = sid
      ? `${baseUrl()}/schedule/${app.scheduling_token}?slot=${sid}`
      : `${baseUrl()}/schedule/${app.scheduling_token}`;
    return `${start.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}\n→ ${link}`;
  });

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: app.email as string,
    subject: `Updated interview times — ${job.title}`,
    text: `Hi ${app.full_name},

The hiring team approved new times for your ${job.title} interview. Please choose one:

${slotLines.join("\n\n")}

Your previous options were released; these are the active choices.

— The Hiring Team`,
  });
}

export async function declineAlternativeProposal(
  proposalToken: string
): Promise<{ nextRound: boolean }> {
  const { data: proposal, error } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("*")
    .eq("token", proposalToken)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !proposal) throw new Error("Proposal not found or already processed.");

  const appId = proposal.application_id as string;

  await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .update({ status: "declined" })
    .eq("id", proposal.id as string);

  const { count: declinedCount } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("id", { count: "exact", head: true })
    .eq("application_id", appId)
    .eq("status", "declined");

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("full_name, email, role_id")
    .eq("id", appId)
    .single();

  if (!app) throw new Error("Application not found");

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) throw new Error("Job not found");

  if ((declinedCount ?? 0) >= 5) {
    await supabaseAdmin
      .from("applications")
      .update({ scheduling_awaiting_alternatives: false })
      .eq("id", appId);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: job.interviewerEmail,
      subject: `Scheduling: manual follow-up needed for ${app.full_name}`,
      text: `Several alternative slot suggestions were declined. Please coordinate manually with ${app.full_name} (${app.email}).`,
    });
    return { nextRound: false };
  }

  const historic = await loadHistoricProposedRanges(appId);
  const pool = await findAlternativeSlotPool(job.interviewerEmail, appId, historic);
  const ranked = await rankAlternativesWithAI(
    pool,
    "",
    job.title,
    app.full_name as string
  );

  if (ranked.length < 3) {
    await supabaseAdmin
      .from("applications")
      .update({ scheduling_awaiting_alternatives: false })
      .eq("id", appId);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: job.interviewerEmail,
      subject: `No automatic slots left for ${app.full_name}`,
      text: `Could not find 3 more non-overlapping slots after your decline. Please reschedule manually. Candidate: ${app.email}`,
    });
    return { nextRound: false };
  }

  const top3 = ranked.slice(0, 3);
  const newToken = crypto.randomBytes(24).toString("hex");
  const proposed_slots: SlotJson[] = top3.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));

  await supabaseAdmin.from("scheduling_alternative_proposals").insert({
    application_id: appId,
    interviewer_email: job.interviewerEmail,
    token: newToken,
    candidate_note: null,
    proposed_slots,
    status: "pending",
  });

  const lines = top3
    .map((s, i) => {
      const d = new Date(s.start);
      return `Option ${i + 1}: ${d.toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
    })
    .join("\n");

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: job.interviewerEmail,
    subject: `Next alternative interview slots for ${app.full_name}`,
    text: `Previous suggestions were declined. Next options:

${lines}

Approve or decline:
${baseUrl()}/schedule/interviewer/${newToken}

— JobApp scheduling`,
  });

  return { nextRound: true };
}

export async function getProposalSummaryForToken(proposalToken: string): Promise<{
  candidateName: string;
  jobTitle: string;
  candidateNote: string | null;
  slots: { label: string }[];
  status: string;
} | null> {
  const { data: proposal } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("application_id, candidate_note, proposed_slots, status")
    .eq("token", proposalToken)
    .maybeSingle();

  if (!proposal) return null;

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("full_name, role_id")
    .eq("id", proposal.application_id as string)
    .single();

  if (!app) return null;

  const job = jobs.find((j) => j.id === app.role_id);
  const proposed = proposal.proposed_slots as SlotJson[];

  return {
    candidateName: app.full_name as string,
    jobTitle: job?.title ?? (app.role_id as string),
    candidateNote: proposal.candidate_note as string | null,
    slots: proposed.map((p) => ({
      label: new Date(p.start).toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    })),
    status: proposal.status as string,
  };
}
