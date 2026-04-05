import { NextRequest, NextResponse } from "next/server";
import { syncConfirmedInterviewCalendarRsvps } from "@/lib/calendar-rsvp-sync";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const isDev = process.env.NODE_ENV === "development";

  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!isDev) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured (required in production)" },
      { status: 501 }
    );
  } else {
    console.warn("[cron] calendar-rsvp: CRON_SECRET unset — ok for local dev only");
  }

  try {
    const result = await syncConfirmedInterviewCalendarRsvps();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] calendar-rsvp:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
