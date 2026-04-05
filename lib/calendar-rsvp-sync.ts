import { Resend } from "resend";
import { supabaseAdmin } from "./supabase";
import { jobs } from "./jobs";
import { fetchCandidateCalendarRsvp, type CalendarRsvpStatus } from "./calendar";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Polls Google Calendar for confirmed interview events and stores the candidate's RSVP.
 * Does not depend on email replies — matches 3C (accept via Calendar Yes).
 */
export async function syncConfirmedInterviewCalendarRsvps(): Promise<{
  checked: number;
  updated: number;
  newlyAccepted: number;
}> {
  const { data: slots } = await supabaseAdmin
    .from("interview_slots")
    .select(
      "id, application_id, google_event_id, interviewer_email, calendar_candidate_rsvp, calendar_acceptance_notified, start_time, end_time"
    )
    .eq("status", "confirmed")
    .not("google_event_id", "is", null);

  if (!slots?.length) {
    return { checked: 0, updated: 0, newlyAccepted: 0 };
  }

  const appIds = [...new Set(slots.map((s) => s.application_id as string))];
  const { data: apps } = await supabaseAdmin
    .from("applications")
    .select("id, email, full_name, role_id")
    .in("id", appIds);

  const appById = new Map((apps ?? []).map((a) => [a.id as string, a]));

  let checked = 0;
  let updated = 0;
  let newlyAccepted = 0;
  const now = Date.now();

  for (const slot of slots) {
    const endMs = new Date(slot.end_time as string).getTime();
    if (endMs < now - 24 * 60 * 60 * 1000) continue;

    const app = appById.get(slot.application_id as string);
    if (!app?.email) continue;

    checked += 1;
    let remote: CalendarRsvpStatus;
    try {
      remote = await fetchCandidateCalendarRsvp(
        slot.interviewer_email as string,
        slot.google_event_id as string,
        app.email as string
      );
    } catch (err) {
      console.error(
        "[calendar-rsvp] events.get failed:",
        slot.id,
        err instanceof Error ? err.message : err
      );
      continue;
    }

    const prev = slot.calendar_candidate_rsvp as CalendarRsvpStatus | null | undefined;
    if (remote === prev) {
      await supabaseAdmin
        .from("interview_slots")
        .update({ calendar_rsvp_synced_at: new Date().toISOString() })
        .eq("id", slot.id as string);
      continue;
    }

    updated += 1;
    await supabaseAdmin
      .from("interview_slots")
      .update({
        calendar_candidate_rsvp: remote,
        calendar_rsvp_synced_at: new Date().toISOString(),
      })
      .eq("id", slot.id as string);

    if (
      remote === "accepted" &&
      prev !== "accepted" &&
      !slot.calendar_acceptance_notified
    ) {
      newlyAccepted += 1;
      const job = jobs.find((j) => j.id === (app.role_id as string));
      await resend.emails
        .send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: slot.interviewer_email as string,
          subject: `Calendar: ${app.full_name} accepted the interview invite`,
          text: `${app.full_name} (${app.email}) responded Yes to the Google Calendar invite for the ${job?.title ?? "interview"}.

No email reply from the candidate is required — RSVP was read from Google Calendar.

— JobApp scheduling`,
        })
        .catch((e) => console.error("[calendar-rsvp] interviewer notify failed:", e));

      await supabaseAdmin
        .from("interview_slots")
        .update({ calendar_acceptance_notified: true })
        .eq("id", slot.id as string);
    }
  }

  return { checked, updated, newlyAccepted };
}
