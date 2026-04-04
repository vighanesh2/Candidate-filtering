import { NextRequest, NextResponse } from "next/server";
import {
  getProposalSummaryForToken,
  approveAlternativeProposal,
  declineAlternativeProposal,
} from "@/lib/schedule-alternatives";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const summary = await getProposalSummaryForToken(token);
  if (!summary) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(summary);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    if (action === "approve") {
      await approveAlternativeProposal(token);
      return NextResponse.json({ success: true, outcome: "approved" });
    }
    if (action === "decline") {
      const { nextRound } = await declineAlternativeProposal(token);
      return NextResponse.json({ success: true, outcome: "declined", nextRound });
    }
    return NextResponse.json({ error: "action must be approve or decline" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schedule] interviewer action:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
