import crypto from "crypto";
import { Resend } from "resend";
import { supabaseAdmin } from "./supabase";
import { jobs } from "./jobs";
import {
  findFreeSlots,
  createTentativeHold,
  confirmEvent,
  deleteEvent,
} from "./calendar";
import { getTentativeHoldSlotsForInterviewer } from "./scheduling-holds";

const resend = new Resend(process.env.RESEND_API_KEY!);

/** Spec 3B: three simultaneous holds per offer; only one can be confirmed. */
const OFFER_SLOT_COUNT = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type InterviewSlot = {
  id: string;
  application_id: string;
  interviewer_email: string;
  start_time: string;
  end_time: string;
  google_event_id: string | null;
  status: "tentative" | "confirmed" | "cancelled";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlotForEmail(start: Date, index: number): string {
  const day = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Option ${index + 1}: ${day} at ${time} (45 minutes)`;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

/** Remove this application's tentative rows + Google events (before resend or after alternative approval). */
export async function cancelTentativeSlotsForApplication(applicationId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from("interview_slots")
    .select("id, google_event_id, interviewer_email")
    .eq("application_id", applicationId)
    .eq("status", "tentative");

  for (const row of rows ?? []) {
    if (row.google_event_id) {
      await deleteEvent(row.interviewer_email as string, row.google_event_id as string);
    }
    await supabaseAdmin
      .from("interview_slots")
      .update({ status: "cancelled" })
      .eq("id", row.id as string);
  }
}

// ─── Send Scheduling Options ──────────────────────────────────────────────────

/**
 * Finds free slots (excluding all DB tentative holds for this interviewer),
 * creates tentative holds, saves to DB, and emails the candidate.
 */
export async function sendSchedulingOptions(applicationId: string): Promise<void> {
  // 1. Load application
  const { data: app, error: appError } = await supabaseAdmin
    .from("applications")
    .select("full_name, email, role_id, status")
    .eq("id", applicationId)
    .single();

  if (appError || !app) throw new Error("Application not found");

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) throw new Error(`Job not found: ${app.role_id}`);

  // 2. Release prior tentative offers for this candidate (admin resend)
  await cancelTentativeSlotsForApplication(applicationId);

  // 3. Other candidates' tentative holds block the same wall-clock windows (3B conflict prevention)
  const extraBusy = await getTentativeHoldSlotsForInterviewer(job.interviewerEmail);
  const freeSlots = await findFreeSlots(job.interviewerEmail, OFFER_SLOT_COUNT, {
    extraBusy,
  });
  if (freeSlots.length < OFFER_SLOT_COUNT) {
    throw new Error(
      `Need ${OFFER_SLOT_COUNT} free slots; only found ${freeSlots.length}. Other pending offers may be holding times.`
    );
  }

  const token = crypto.randomUUID();
  const offerBatchId = crypto.randomUUID();
  const savedSlots: InterviewSlot[] = [];

  for (const slot of freeSlots) {
    const eventId = await createTentativeHold(
      job.interviewerEmail,
      slot,
      app.full_name
    );

    const { data: saved, error } = await supabaseAdmin
      .from("interview_slots")
      .insert({
        application_id: applicationId,
        interviewer_email: job.interviewerEmail,
        start_time: slot.start.toISOString(),
        end_time: slot.end.toISOString(),
        google_event_id: eventId,
        status: "tentative",
        offer_batch_id: offerBatchId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save slot: ${error.message}`);
    savedSlots.push(saved as InterviewSlot);
  }

  // 4. Save token on the application + update status
  const { data: current } = await supabaseAdmin
    .from("applications")
    .select("status_history")
    .eq("id", applicationId)
    .single();

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update({
      scheduling_token: token,
      scheduling_sent_at: new Date().toISOString(),
      scheduling_follow_up_sent_at: null,
      scheduling_awaiting_alternatives: false,
      status: "scheduling_sent",
      status_history: [
        ...((current?.status_history as object[]) ?? []),
        {
          status: "scheduling_sent",
          note: `${savedSlots.length} interview slots offered (batch ${offerBatchId.slice(0, 8)}…)`,
          changed_at: new Date().toISOString(),
          is_override: false,
        },
      ],
    })
    .eq("id", applicationId);

  if (updateError) throw new Error(`Failed to update application: ${updateError.message}`);

  // 5. Send email to candidate
  const slotLines = savedSlots
    .map((s, i) => {
      const start = new Date(s.start_time);
      const link = `${baseUrl()}/schedule/${token}?slot=${s.id}`;
      return `${formatSlotForEmail(start, i)}\n→ ${link}`;
    })
    .join("\n\n");

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: app.email,
    subject: `Schedule your interview for ${job.title} at our company`,
    text: `Hi ${app.full_name},

Congratulations — we'd love to move forward with your application for the ${job.title} role!

Please choose one of the following interview times (${OFFER_SLOT_COUNT} options, 45 minutes each):

${slotLines}

Simply click your preferred time to confirm. Slots are first-come, first-served.

Looking forward to speaking with you.

Best,
The Hiring Team`,
  });

  console.log(
    `[schedule] Sent ${savedSlots.length} slots to ${app.email} for application ${applicationId}`
  );
}

// ─── Confirm a Slot ───────────────────────────────────────────────────────────

/**
 * Called when the candidate clicks a slot link.
 * Confirms the chosen slot, cleans up the rest, and sends confirmations.
 */
export async function confirmSlot(
  token: string,
  slotId: string
): Promise<{ candidateName: string; confirmedSlot: InterviewSlot }> {
  // 1. Validate token → application
  const { data: app, error: appError } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, scheduling_token")
    .eq("scheduling_token", token)
    .single();

  if (appError || !app) throw new Error("Invalid or expired scheduling link");
  if (app.scheduling_token !== token) throw new Error("Token mismatch");

  // 2. Load the chosen slot and verify it belongs to this application
  const { data: slot, error: slotError } = await supabaseAdmin
    .from("interview_slots")
    .select("*")
    .eq("id", slotId)
    .eq("application_id", app.id)
    .single();

  if (slotError || !slot) throw new Error("Slot not found");
  if (slot.status !== "tentative") throw new Error("This slot has already been taken or cancelled");

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) throw new Error("Job not found");

  // 3. Atomic confirm — only one session can flip tentative → confirmed for this row (3B race safety)
  const { data: locked, error: lockErr } = await supabaseAdmin
    .from("interview_slots")
    .update({ status: "confirmed" })
    .eq("id", slotId)
    .eq("application_id", app.id)
    .eq("status", "tentative")
    .select()
    .maybeSingle();

  if (lockErr) throw new Error(lockErr.message);
  if (!locked) throw new Error("Slot no longer available — someone else may have confirmed it.");

  // 4. Confirm the chosen Google Calendar event
  if (slot.google_event_id) {
    await confirmEvent(
      slot.interviewer_email,
      slot.google_event_id,
      app.full_name,
      app.email,
      job.title
    );
  }

  // 5. Cancel (delete) the other tentative holds for this application
  const { data: otherSlots } = await supabaseAdmin
    .from("interview_slots")
    .select("id, google_event_id")
    .eq("application_id", app.id)
    .eq("status", "tentative")
    .neq("id", slotId);

  if (otherSlots) {
    for (const other of otherSlots) {
      if (other.google_event_id) {
        await deleteEvent(slot.interviewer_email, other.google_event_id);
      }
      await supabaseAdmin
        .from("interview_slots")
        .update({ status: "cancelled" })
        .eq("id", other.id);
    }
  }

  // 6. Update application status
  const { data: current } = await supabaseAdmin
    .from("applications")
    .select("status_history")
    .eq("id", app.id)
    .single();

  const confirmedStart = new Date(slot.start_time);
  const timeStr = confirmedStart.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  await supabaseAdmin
    .from("applications")
    .update({
      status: "in_interview",
      status_history: [
        ...((current?.status_history as object[]) ?? []),
        {
          status: "in_interview",
          note: `Interview confirmed for ${timeStr}`,
          changed_at: new Date().toISOString(),
          is_override: false,
        },
      ],
    })
    .eq("id", app.id);

  // 7. Send confirmation emails
  const dayStr = confirmedStart.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeOnlyStr = confirmedStart.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  await Promise.all([
    // Candidate confirmation
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: app.email,
      subject: `Interview confirmed — ${job.title}`,
      text: `Hi ${app.full_name},

Your interview is confirmed!

Role: ${job.title}
Date: ${dayStr}
Time: ${timeOnlyStr} (45 minutes)
Interviewer: ${slot.interviewer_email}

A calendar invite will follow shortly. Please let us know if you need to reschedule.

Best,
The Hiring Team`,
    }),

    // Interviewer notification
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: slot.interviewer_email,
      subject: `Interview confirmed: ${app.full_name} for ${job.title}`,
      text: `Hi,

${app.full_name} has confirmed their interview slot.

Role: ${job.title}
Candidate: ${app.full_name} (${app.email})
Date: ${dayStr}
Time: ${timeOnlyStr} (45 minutes)

The calendar event has been updated. Other tentative holds have been removed.`,
    }),
  ]);

  console.log(`[schedule] Confirmed slot ${slotId} for application ${app.id}`);
  return { candidateName: app.full_name, confirmedSlot: slot as InterviewSlot };
}

// ─── Load Slots for Candidate Page ───────────────────────────────────────────

export async function getSchedulingPage(token: string): Promise<{
  candidateName: string;
  jobTitle: string;
  slots: InterviewSlot[];
  alreadyConfirmed: boolean;
  awaitingAlternatives: boolean;
  hasPendingAlternativeRequest: boolean;
}> {
  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, role_id, status, scheduling_awaiting_alternatives")
    .eq("scheduling_token", token)
    .single();

  if (error || !app) throw new Error("Invalid link");

  const job = jobs.find((j) => j.id === app.role_id);

  const { data: slots } = await supabaseAdmin
    .from("interview_slots")
    .select("*")
    .eq("application_id", app.id)
    .order("start_time", { ascending: true });

  const alreadyConfirmed = app.status === "in_interview";

  const { data: pendingAlt } = await supabaseAdmin
    .from("scheduling_alternative_proposals")
    .select("id")
    .eq("application_id", app.id)
    .eq("status", "pending")
    .maybeSingle();

  return {
    candidateName: app.full_name,
    jobTitle: job?.title ?? app.role_id,
    slots: (slots ?? []) as InterviewSlot[],
    alreadyConfirmed,
    awaitingAlternatives: !!(app as { scheduling_awaiting_alternatives?: boolean })
      .scheduling_awaiting_alternatives,
    hasPendingAlternativeRequest: !!pendingAlt,
  };
}

/** 48h nudge for candidates who did not pick a slot (cron). */
export async function sendSchedulingFollowUpNudges(): Promise<{ sent: number }> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: apps } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, scheduling_token, scheduling_sent_at")
    .eq("status", "scheduling_sent")
    .not("scheduling_sent_at", "is", null)
    .lt("scheduling_sent_at", cutoff)
    .is("scheduling_follow_up_sent_at", null);

  let sent = 0;
  for (const app of apps ?? []) {
    const job = jobs.find((j) => j.id === app.role_id);
    const link = `${baseUrl()}/schedule/${app.scheduling_token}`;
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: app.email as string,
      subject: `Reminder: pick your interview time — ${job?.title ?? "your application"}`,
      text: `Hi ${app.full_name},

We haven't heard back about your interview slot yet. Please choose a time as soon as you can:

${link}

If none of the times work, use the "request different times" option on that page.

— The Hiring Team`,
    });
    await supabaseAdmin
      .from("applications")
      .update({ scheduling_follow_up_sent_at: new Date().toISOString() })
      .eq("id", app.id as string);
    sent += 1;
  }
  return { sent };
}
