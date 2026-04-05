import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { mapOfferLetterRowFromDb } from "@/lib/offer-letter";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("offer_letters")
    .select("*")
    .eq("application_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(null);
  }

  return NextResponse.json(mapOfferLetterRowFromDb(data as Record<string, unknown>));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  let body: { draft_body?: string; review_status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.draft_body === "string") {
    updates.draft_body = body.draft_body;
  }
  if (body.review_status === "draft" || body.review_status === "approved") {
    updates.review_status = body.review_status;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json(
      { error: "Provide draft_body and/or review_status (draft | approved)" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("offer_letters")
    .select("id")
    .eq("application_id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "No offer letter yet — generate a draft first" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("offer_letters")
    .update(updates)
    .eq("application_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapOfferLetterRowFromDb(data as Record<string, unknown>));
}
