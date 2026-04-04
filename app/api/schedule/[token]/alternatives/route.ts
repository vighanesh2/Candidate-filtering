import { NextRequest, NextResponse } from "next/server";
import { requestAlternativeTimes } from "@/lib/schedule-alternatives";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let note = "";
  try {
    const body = await req.json();
    note = typeof body.note === "string" ? body.note : "";
  } catch {
    /* empty body */
  }

  try {
    await requestAlternativeTimes(token, note);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schedule] alternatives error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
