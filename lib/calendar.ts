import { randomUUID } from "crypto";
import { google } from "googleapis";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    "http://localhost:3000"
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN! });
  return client;
}

function getCalendar() {
  return google.calendar({ version: "v3", auth: getOAuth2Client() });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarSlot = {
  start: Date;
  end: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the next N business days starting from tomorrow. */
function nextBusinessDays(n: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1); // start tomorrow

  while (days.length < n) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Generates all possible 45-min slots within 9am–5pm for a given day. */
function candidateSlots(day: Date): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  // 9:00, 9:45, 10:30, 11:15, 12:00, 12:45, 13:30, 14:15, 15:00, 15:45, 16:00
  for (let hour = 9; hour < 17; hour++) {
    for (let min = 0; min < 60; min += 45) {
      const start = new Date(day);
      start.setHours(hour, min, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 45);
      if (end.getHours() < 17 || (end.getHours() === 17 && end.getMinutes() === 0)) {
        slots.push({ start, end });
      }
    }
  }
  return slots;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Finds up to `count` free 45-minute slots on the interviewer's calendar
 * within the next `businessDays` business days (9am–5pm).
 * `extraBusy` adds other holds (e.g. tentative interview_slots for any candidate)
 * so two offers cannot claim the same window.
 */
export async function findFreeSlots(
  interviewerEmail: string,
  count = 5,
  options?: { extraBusy?: CalendarSlot[]; businessDays?: number }
): Promise<CalendarSlot[]> {
  const cal = getCalendar();
  const businessDays = options?.businessDays ?? 5;
  const days = nextBusinessDays(businessDays);
  const windowStart = days[0];
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  const freeBusyRes = await cal.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: interviewerEmail }],
    },
  });

  const busyIntervals =
    freeBusyRes.data.calendars?.[interviewerEmail]?.busy ?? [];

  const extraBusy = options?.extraBusy ?? [];

  const freeSlots: CalendarSlot[] = [];

  for (const day of days) {
    if (freeSlots.length >= count) break;

    for (const slot of candidateSlots(day)) {
      if (freeSlots.length >= count) break;

      const s0 = slot.start.getTime();
      const s1 = slot.end.getTime();

      const overlapsCalendar = busyIntervals.some((busy) => {
        const busyStart = new Date(busy.start!).getTime();
        const busyEnd = new Date(busy.end!).getTime();
        return intervalsOverlap(s0, s1, busyStart, busyEnd);
      });

      const overlapsHold = extraBusy.some((h) =>
        intervalsOverlap(s0, s1, h.start.getTime(), h.end.getTime())
      );

      if (!overlapsCalendar && !overlapsHold) freeSlots.push(slot);
    }
  }

  return freeSlots;
}

/**
 * Creates a tentative "hold" event on the interviewer's calendar.
 * Returns the Google Calendar event ID.
 */
export async function createTentativeHold(
  interviewerEmail: string,
  slot: CalendarSlot,
  candidateName: string
): Promise<string> {
  const cal = getCalendar();

  const event = await cal.events.insert({
    calendarId: interviewerEmail,
    sendUpdates: "none",
    requestBody: {
      summary: `[Hold] Interview – ${candidateName}`,
      description:
        "Tentative hold pending candidate confirmation. Do not schedule other meetings over this slot.",
      start: { dateTime: slot.start.toISOString() },
      end: { dateTime: slot.end.toISOString() },
      status: "tentative",
      transparency: "opaque", // marks the interviewer as busy
    },
  });

  return event.data.id!;
}

export type ConfirmInterviewCalendarParams = {
  /** Tentative hold created at scheduling-offer time; removed after the real invite is created. */
  holdEventId: string | null;
  startTimeIso: string;
  endTimeIso: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
};

export type ConfirmInterviewCalendarResult = {
  eventId: string;
  /** HTTPS Meet URL when Google returns it (for emails / UI). */
  meetLink: string | null;
};

function meetLinkFromEventBody(data: {
  hangoutLink?: string | null;
  conferenceData?: { entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null } | null;
}): string | null {
  const direct = data.hangoutLink?.trim();
  if (direct) return direct;
  const video = data.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video" && ep.uri?.trim()
  );
  if (video?.uri?.trim()) return video.uri.trim();
  return null;
}

/**
 * Creates a **new** Google Calendar event with the candidate as guest, **Google Meet**, and
 * `sendUpdates: "all"` so Google emails the invitation.
 *
 * We use `events.insert` (not `patch` on the hold) because patching a tentative internal hold
 * often fails to attach Meet or to send guest invites reliably.
 *
 * @returns New event id (store on `interview_slots.google_event_id`) and Meet URL when present.
 */
export async function confirmEvent(
  interviewerEmail: string,
  params: ConfirmInterviewCalendarParams
): Promise<ConfirmInterviewCalendarResult> {
  const cal = getCalendar();
  const {
    holdEventId,
    startTimeIso,
    endTimeIso,
    candidateName,
    candidateEmail,
    jobTitle,
  } = params;

  // sendUpdates: "all" → Google emails the guest. Do NOT add the organizer as an attendee.
  let inserted;
  try {
    inserted = await cal.events.insert({
      calendarId: interviewerEmail,
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Interview – ${candidateName} (${jobTitle})`,
        description: `Confirmed interview with ${candidateName} (${candidateEmail}).

Join: use the Google Meet link on this calendar event (or open the event in Google Calendar).

RSVP: use Yes / Maybe / No in the invitation email or in Google Calendar (you do not need to reply to the employer's separate email).`,
        start: { dateTime: startTimeIso },
        end: { dateTime: endTimeIso },
        transparency: "opaque",
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false,
        attendees: [
          {
            email: candidateEmail,
            displayName: candidateName,
            responseStatus: "needsAction",
          },
        ],
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const gaxios = err as { response?: { data?: unknown } };
    const detail = gaxios.response?.data
      ? ` ${JSON.stringify(gaxios.response.data)}`
      : "";
    console.error("[calendar] confirmEvent insert failed:", msg + detail);
    throw new Error(
      `Google Calendar could not create the interview invite (Meet + guest). ${msg}. If this mentions permissions or conference data, reconnect Google OAuth with Calendar scope or check Workspace Meet settings.${detail ? " Details logged server-side." : ""}`
    );
  }

  const newEventId = inserted.data.id;
  if (!newEventId) {
    throw new Error("Google Calendar returned no event id after insert");
  }

  let meetLink = meetLinkFromEventBody(inserted.data);
  if (!meetLink) {
    const refreshed = await cal.events.get({
      calendarId: interviewerEmail,
      eventId: newEventId,
    });
    meetLink = meetLinkFromEventBody(refreshed.data);
  }

  if (!meetLink) {
    console.warn(
      "[calendar] Event created but no Meet link in API response — check Google Workspace Meet settings or admin policy."
    );
  }

  if (holdEventId) {
    await deleteEvent(interviewerEmail, holdEventId);
  }

  return { eventId: newEventId, meetLink };
}

export type CalendarRsvpStatus =
  | "needs_action"
  | "accepted"
  | "declined"
  | "tentative"
  | "unknown";

/** Reads the candidate's responseStatus on the organizer's calendar event. */
export async function fetchCandidateCalendarRsvp(
  interviewerEmail: string,
  eventId: string,
  candidateEmail: string
): Promise<CalendarRsvpStatus> {
  const cal = getCalendar();
  const ev = await cal.events.get({
    calendarId: interviewerEmail,
    eventId,
  });
  const norm = candidateEmail.trim().toLowerCase();
  const attendees = ev.data.attendees ?? [];
  const guest = attendees.find((a) => (a.email ?? "").toLowerCase() === norm);
  if (!guest) return "unknown";
  switch (guest.responseStatus) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "tentative":
      return "tentative";
    case "needsAction":
      return "needs_action";
    default:
      return "unknown";
  }
}

/**
 * Deletes a calendar event (used to remove unselected tentative holds).
 */
export async function deleteEvent(
  interviewerEmail: string,
  eventId: string
): Promise<void> {
  const cal = getCalendar();
  await cal.events.delete({ calendarId: interviewerEmail, eventId }).catch(() => {
    // Ignore 404 — event may already be gone
  });
}
