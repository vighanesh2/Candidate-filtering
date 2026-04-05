import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { verifySlackSigningSecret, handleSlackTeamJoinEvent } from "@/lib/slack-onboarding";

export const dynamic = "force-dynamic";

function runInBackground(promise: Promise<unknown>): void {
  waitUntil(promise);
  void promise;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!secret) {
    console.error("[slack] events: SLACK_SIGNING_SECRET is not set (add it in Vercel → Environment Variables for Production)");
    return new Response("Slack signing secret not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const ok = verifySlackSigningSecret(
    rawBody,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    secret
  );
  if (!ok) {
    console.warn(
      "[slack] events: signature verification failed — use Signing Secret from api.slack.com → Your App → Basic Information (not the deprecated Verification Token)"
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let body: {
    type?: string;
    challenge?: string;
    event?: { type?: string; user?: string | { id?: string } };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (body.type === "url_verification" && typeof body.challenge === "string") {
    // Slack accepts plain text, form-encoded, or JSON; JSON is reliable behind CDNs.
    return Response.json({ challenge: body.challenge }, { status: 200 });
  }

  if (body.type === "event_callback" && body.event?.type === "team_join") {
    const u = body.event.user;
    const userId = typeof u === "string" ? u : u?.id;
    if (userId) {
      runInBackground(
        handleSlackTeamJoinEvent(userId).catch((err) =>
          console.error("[slack] team_join:", err instanceof Error ? err.message : err)
        )
      );
    }
  }

  return new Response(null, { status: 200 });
}
