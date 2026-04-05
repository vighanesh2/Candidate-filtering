import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ingestAssemblyAIFromBuffer } from "@/lib/interview-transcript";

/** Long interviews can take several minutes to transcribe. */
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data: app } = await supabaseAdmin
    .from("applications")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file field (multipart form, name=file)" },
      { status: 400 }
    );
  }

  const maxBytes = 4 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error:
          "File too large for this upload route (4 MB max on typical Vercel limits). Use a public URL with assemblyAudioUrl on the main transcript POST instead.",
      },
      { status: 400 }
    );
  }

  try {
    const buf = await file.arrayBuffer();
    const row = await ingestAssemblyAIFromBuffer(
      id,
      buf,
      (app.full_name as string) ?? "Candidate",
      file.name || "recording"
    );
    return NextResponse.json({ success: true, transcript: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[interview-transcript/assembly] ingest:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
