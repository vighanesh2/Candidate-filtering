import { NextRequest, NextResponse } from "next/server";
import { getSchedulingPage, confirmSlot } from "@/lib/schedule";

// GET — load the scheduling page data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const data = await getSchedulingPage(token);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

// POST — candidate confirms a slot
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { slotId } = await req.json();

  if (!slotId) {
    return NextResponse.json({ error: "slotId is required" }, { status: 400 });
  }

  try {
    const result = await confirmSlot(token, slotId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schedule] confirm error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
