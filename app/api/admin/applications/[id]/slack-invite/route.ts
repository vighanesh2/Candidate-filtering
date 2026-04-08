import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  mapOfferLetterRowFromDb,
  validateQuestionnaire,
  type OfferLetterQuestionnaire,
} from "@/lib/offer-letter";
import { kickOffSlackOnboardingAfterOfferSigned } from "@/lib/slack-onboarding";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.SLACK_WORKSPACE_INVITE_URL?.trim()) {
    console.warn("[slack-invite] 400: SLACK_WORKSPACE_INVITE_URL missing");
    return NextResponse.json(
      { error: "SLACK_WORKSPACE_INVITE_URL is not set on the server." },
      { status: 400 }
    );
  }

  const { data: app, error: appError } = await supabaseAdmin
    .from("applications")
    .select("id, full_name, email, role_id")
    .eq("id", id)
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from("offer_letters")
    .select("*")
    .eq("application_id", id)
    .maybeSingle();

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (!row) {
    console.warn("[slack-invite] 400: no offer_letters row for application", id);
    return NextResponse.json({ error: "No offer letter for this candidate." }, { status: 400 });
  }
  if (!row.signed_at) {
    console.warn("[slack-invite] 400: offer not signed (signed_at null)", id);
    return NextResponse.json(
      {
        error:
          "The offer must be signed first. This invite is also sent automatically when the candidate signs.",
      },
      { status: 400 }
    );
  }

  const questionnaire = row.questionnaire as OfferLetterQuestionnaire | undefined;
  if (!questionnaire) {
    console.warn("[slack-invite] 400: questionnaire missing on offer_letters", id);
    return NextResponse.json(
      { error: "Offer letter is missing questionnaire data — regenerate or save the offer from admin." },
      { status: 400 }
    );
  }
  const qErr = validateQuestionnaire(questionnaire);
  if (qErr) {
    console.warn("[slack-invite] 400: questionnaire invalid:", qErr);
    return NextResponse.json({ error: qErr }, { status: 400 });
  }

  try {
    await kickOffSlackOnboardingAfterOfferSigned({
      applicationId: app.id as string,
      candidateEmail: app.email as string,
      fullName: app.full_name as string,
      roleId: app.role_id as string,
      questionnaire,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[slack-invite]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { data: fresh, error: freshErr } = await supabaseAdmin
    .from("offer_letters")
    .select("*")
    .eq("application_id", id)
    .single();

  if (freshErr || !fresh) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({
    success: true,
    offerLetter: mapOfferLetterRowFromDb(fresh as Record<string, unknown>),
  });
}
