import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jobs } from "@/lib/jobs";
import type { AIParsed } from "@/lib/screen";
import type { ResearchProfile } from "@/lib/research";
import {
  generateOfferLetterDraft,
  mapOfferLetterRowFromDb,
  parseQuestionnaire,
  validateQuestionnaire,
} from "@/lib/offer-letter";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: app, error: appError } = await supabaseAdmin
    .from("applications")
    .select(
      "id, full_name, email, linkedin_url, portfolio_url, role_id, ai_parsed, research_profile"
    )
    .eq("id", id)
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const questionnaire = parseQuestionnaire(raw);
  const validationError = validateQuestionnaire(questionnaire);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const job = jobs.find((j) => j.id === app.role_id);
  if (!job) {
    return NextResponse.json({ error: "Job not found for application" }, { status: 400 });
  }

  const companyName =
    process.env.OFFER_LETTER_COMPANY_NAME?.trim() || "the Company";

  try {
    const draft = await generateOfferLetterDraft({
      companyName,
      job,
      questionnaire,
      fullName: app.full_name as string,
      email: app.email as string,
      linkedinUrl: app.linkedin_url as string,
      portfolioUrl: (app.portfolio_url as string | null) ?? null,
      aiParsed: (app.ai_parsed as AIParsed | null) ?? null,
      researchProfile: (app.research_profile as ResearchProfile | null) ?? null,
    });

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("offer_letters")
      .upsert(
        {
          application_id: id,
          questionnaire,
          draft_body: draft,
          review_status: "draft",
          updated_at: now,
        },
        { onConflict: "application_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[offer-letter] upsert:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      offerLetter: mapOfferLetterRowFromDb(data as Record<string, unknown>),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[offer-letter] generate:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
