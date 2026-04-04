import { NextRequest, NextResponse } from "next/server";
import { sendSchedulingOptions } from "@/lib/schedule";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await sendSchedulingOptions(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schedule] route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
