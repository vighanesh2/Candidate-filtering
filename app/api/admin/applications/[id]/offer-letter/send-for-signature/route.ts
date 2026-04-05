import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { jobs } from "@/lib/jobs";
import { mapOfferLetterRowFromDb } from "@/lib/offer-letter";
import { baseUrlFromEnv, sendOfferSigningLinkEmail } from "@/lib/offer-signing";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  if (!row || !(row.draft_body as string)?.trim()) {
    return NextResponse.json(
      { error: "Create and save an offer letter draft first." },
      { status: 400 }
    );
  }

  if (row.signed_at) {
    return NextResponse.json(
      { error: "This offer has already been signed." },
      { status: 400 }
    );
  }

  if (row.review_status !== "approved" && row.review_status !== "sent") {
    return NextResponse.json(
      { error: "Mark the offer as approved before sending for signature." },
      { status: 400 }
    );
  }

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("offer_letters")
    .update({
      signing_token: token,
      signing_email_sent_at: now,
      review_status: "sent",
      updated_at: now,
    })
    .eq("application_id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const base = baseUrlFromEnv().replace(/\/$/, "");
  const signingUrl = `${base}/offer/sign/${token}`;

  try {
    await sendOfferSigningLinkEmail({
      candidateEmail: app.email as string,
      candidateName: app.full_name as string,
      jobTitle: job.title,
      signingUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[offer-signing] email failed:", msg);
    return NextResponse.json(
      {
        error: `Signing link was created but email failed: ${msg}. Share this URL manually: ${signingUrl}`,
        offerLetter: mapOfferLetterRowFromDb(updated as Record<string, unknown>),
        signingUrl,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    offerLetter: mapOfferLetterRowFromDb(updated as Record<string, unknown>),
    signingUrl,
  });
}
