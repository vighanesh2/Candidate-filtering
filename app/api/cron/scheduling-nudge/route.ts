import { NextRequest, NextResponse } from "next/server";
import { sendSchedulingFollowUpNudges } from "@/lib/schedule";

/**
 * Production: set CRON_SECRET and call with
 *   Authorization: Bearer <CRON_SECRET>
 * Local dev: if CRON_SECRET is unset, the route still runs (NODE_ENV=development only).
 */
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
    console.warn("[cron] scheduling-nudge: CRON_SECRET unset — ok for local dev only");
  }

  try {
    const { sent } = await sendSchedulingFollowUpNudges();
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] scheduling-nudge:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
