import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ingestAssemblyAIFromUrl,
  ingestFirefliesTranscriptForApplication,
  ingestMockTranscriptForApplication,
  listInterviewTranscripts,
} from "@/lib/interview-transcript";

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
  try {
    const rows = await listInterviewTranscripts(id);
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

  let body: {
    firefliesTranscriptId?: string;
    useMock?: boolean;
    assemblyAudioUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.useMock) {
      const row = await ingestMockTranscriptForApplication(
        id,
        (app.full_name as string) ?? "Candidate"
      );
      return NextResponse.json({ success: true, transcript: row });
    }
    const audioUrl = body.assemblyAudioUrl?.trim();
    if (audioUrl) {
      const row = await ingestAssemblyAIFromUrl(
        id,
        audioUrl,
        (app.full_name as string) ?? "Candidate"
      );
      return NextResponse.json({ success: true, transcript: row });
    }
    const tid = body.firefliesTranscriptId?.trim();
    if (!tid) {
      return NextResponse.json(
        {
          error:
            "Provide assemblyAudioUrl (public audio URL, free AssemblyAI), firefliesTranscriptId, or useMock: true",
        },
        { status: 400 }
      );
    }
    const row = await ingestFirefliesTranscriptForApplication(id, tid);
    return NextResponse.json({ success: true, transcript: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[interview-transcript] ingest:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
