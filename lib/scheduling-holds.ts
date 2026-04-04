import { supabaseAdmin } from "./supabase";
import type { CalendarSlot } from "./calendar";

/** All tentative interview holds for an interviewer (any candidate) — source of truth for conflict prevention. */
export async function getTentativeHoldSlotsForInterviewer(
  interviewerEmail: string
): Promise<CalendarSlot[]> {
  const { data } = await supabaseAdmin
    .from("interview_slots")
    .select("start_time, end_time")
    .eq("interviewer_email", interviewerEmail)
    .eq("status", "tentative");

  return (data ?? []).map((r) => ({
    start: new Date(r.start_time as string),
    end: new Date(r.end_time as string),
  }));
}
