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

/**
 * Finds up to `count` free 45-minute slots on the interviewer's calendar
 * within the next 5 business days (9am–5pm).
 */
export async function findFreeSlots(
  interviewerEmail: string,
  count = 5
): Promise<CalendarSlot[]> {
  const cal = getCalendar();
  const days = nextBusinessDays(5);
  const windowStart = days[0];
  const windowEnd = new Date(days[days.length - 1]);
  windowEnd.setHours(23, 59, 59, 999);

  // Fetch busy intervals for the whole window in one API call
  const freeBusyRes = await cal.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      items: [{ id: interviewerEmail }],
    },
  });

  const busyIntervals =
    freeBusyRes.data.calendars?.[interviewerEmail]?.busy ?? [];

  const freeSlots: CalendarSlot[] = [];

  for (const day of days) {
    if (freeSlots.length >= count) break;

    for (const slot of candidateSlots(day)) {
      if (freeSlots.length >= count) break;

      const overlaps = busyIntervals.some((busy) => {
        const busyStart = new Date(busy.start!).getTime();
        const busyEnd = new Date(busy.end!).getTime();
        return slot.start.getTime() < busyEnd && slot.end.getTime() > busyStart;
      });

      if (!overlaps) freeSlots.push(slot);
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

/**
 * Converts a tentative hold into a confirmed interview event,
 * adding the candidate as an attendee.
 */
export async function confirmEvent(
  interviewerEmail: string,
  eventId: string,
  candidateName: string,
  candidateEmail: string,
  jobTitle: string
): Promise<void> {
  const cal = getCalendar();

  await cal.events.patch({
    calendarId: interviewerEmail,
    eventId,
    requestBody: {
      summary: `Interview – ${candidateName} (${jobTitle})`,
      description: `Confirmed interview with ${candidateName} (${candidateEmail}).`,
      status: "confirmed",
      attendees: [
        { email: interviewerEmail },
        { email: candidateEmail, displayName: candidateName },
      ],
    },
  });
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
