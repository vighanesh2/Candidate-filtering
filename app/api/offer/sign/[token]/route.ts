import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jobs } from "@/lib/jobs";
import type { StatusHistoryEntry } from "@/lib/screen";
import { getRequestClientIp, sendOfferSignedAlertEmails } from "@/lib/offer-signing";
import { kickOffSlackOnboardingAfterOfferSigned } from "@/lib/slack-onboarding";
import type { OfferLetterQuestionnaire } from "@/lib/offer-letter";

const MAX_CAPTURE_LEN = 600_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("offer_letters")
    .select("draft_body, signed_at, application_id")
    .eq("signing_token", token.trim())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Invalid or expired signing link." }, { status: 404 });
  }

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("full_name")
    .eq("id", row.application_id as string)
    .maybeSingle();

  const fullName = (app?.full_name as string) ?? "Candidate";
  const first = fullName.split(/\s+/)[0] ?? fullName;

  return NextResponse.json({
    candidateFirstName: first,
    letterBody: row.draft_body as string,
    alreadySigned: !!row.signed_at,
    signedAt: row.signed_at as string | null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  let body: {
    signatureMethod?: string;
    typedLegalName?: string;
    drawnSignaturePng?: string;
    acceptElectronicSignature?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.acceptElectronicSignature !== true) {
    return NextResponse.json(
      { error: "You must accept electronic signature to continue." },
      { status: 400 }
    );
  }

  const method = body.signatureMethod === "drawn" ? "drawn" : body.signatureMethod === "typed" ? "typed" : null;
  if (!method) {
    return NextResponse.json({ error: "signatureMethod must be typed or drawn." }, { status: 400 });
  }

  let signatureCaptured = "";
  if (method === "typed") {
    signatureCaptured = (body.typedLegalName ?? "").trim();
    if (signatureCaptured.length < 2 || signatureCaptured.length > 200) {
      return NextResponse.json(
        { error: "Enter your full legal name as it should appear on the offer (2–200 characters)." },
        { status: 400 }
      );
    }
  } else {
    signatureCaptured = (body.drawnSignaturePng ?? "").trim();
    if (!signatureCaptured.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Drawn signature must be submitted as a PNG data URL." },
        { status: 400 }
      );
    }
    if (signatureCaptured.length > MAX_CAPTURE_LEN) {
      return NextResponse.json({ error: "Signature image is too large." }, { status: 400 });
    }
  }

  const ip = getRequestClientIp(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const signedAt = new Date().toISOString();

  const { data: offerRow, error: fetchErr } = await supabaseAdmin
    .from("offer_letters")
    .select("id, application_id, signed_at, questionnaire")
    .eq("signing_token", token.trim())
    .maybeSingle();

  if (fetchErr || !offerRow) {
    return NextResponse.json({ error: "Invalid or expired signing link." }, { status: 404 });
  }
  if (offerRow.signed_at) {
    return NextResponse.json({ error: "This offer has already been signed." }, { status: 409 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("offer_letters")
    .update({
      signed_at: signedAt,
      signer_ip: ip,
      signature_method: method,
      signature_captured: signatureCaptured,
      signer_user_agent: userAgent,
      updated_at: signedAt,
    })
    .eq("id", offerRow.id as string)
    .is("signed_at", null);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id, status_history")
    .eq("id", offerRow.application_id as string)
    .single();

  if (app) {
    const history = [
      ...((app.status_history as StatusHistoryEntry[]) ?? []),
      {
        status: "offer",
        note: `Candidate signed offer letter electronically (${method}) at ${signedAt} from IP ${ip}.`,
        changed_at: signedAt,
        is_override: false,
      },
    ] as StatusHistoryEntry[];

    await supabaseAdmin
      .from("applications")
      .update({
        status: "offer",
        status_history: history,
      })
      .eq("id", app.id as string);
  }

  if (app) {
    const job = jobs.find((j) => j.id === (app.role_id as string));
    await sendOfferSignedAlertEmails({
      candidateName: app.full_name as string,
      candidateEmail: app.email as string,
      jobTitle: job?.title ?? "Role",
      roleId: app.role_id as string,
      signedAtIso: signedAt,
      signerIp: ip,
      signatureMethod: method,
    }).catch((err) => console.error("[offer-signing] alert email:", err));

    const questionnaire = offerRow.questionnaire as OfferLetterQuestionnaire | undefined;
    if (questionnaire) {
      void kickOffSlackOnboardingAfterOfferSigned({
        applicationId: app.id as string,
        candidateEmail: app.email as string,
        fullName: app.full_name as string,
        roleId: app.role_id as string,
        questionnaire,
      }).catch((err) => console.error("[slack] kickoff after sign:", err));
    }
  }

  return NextResponse.json({ success: true, signedAt });
}
