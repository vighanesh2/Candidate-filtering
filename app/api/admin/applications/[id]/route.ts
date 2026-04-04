import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const VALID_STATUSES = ["applied", "screened", "shortlisted", "in_interview", "offer", "rejected"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, note } = await req.json();

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Fetch existing history to append
  const { data: current, error: fetchError } = await supabaseAdmin
    .from("applications")
    .select("status_history")
    .eq("id", id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const history = [
    ...((current?.status_history as object[]) ?? []),
    {
      status,
      note: note?.trim() || null,
      changed_at: new Date().toISOString(),
      is_override: true,
    },
  ];

  const { error } = await supabaseAdmin
    .from("applications")
    .update({
      status,
      override_note: note?.trim() || null,
      status_history: history,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
