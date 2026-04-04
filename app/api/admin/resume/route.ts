import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("resumes")
    .createSignedUrl(path, 60); // valid for 60 seconds

  if (error || !data) {
    return NextResponse.json({ error: "Could not generate download link." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
