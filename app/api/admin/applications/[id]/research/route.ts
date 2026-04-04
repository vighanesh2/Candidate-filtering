import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { researchCandidate } from "@/lib/research";

// Research can take 30–60s across multiple API calls
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: app, error } = await supabaseAdmin
    .from("applications")
    .select("full_name, email, portfolio_url, role_id, ai_parsed")
    .eq("id", id)
    .single();

  if (error || !app) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  try {
    await researchCandidate({
      applicationId: id,
      fullName: app.full_name,
      email: app.email,
      portfolioUrl: app.portfolio_url ?? null,
      roleId: app.role_id,
      aiParsed: app.ai_parsed,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[research] route error:", message);
    const publicMsg =
      /FUNCTION_INVOCATION_TIMEOUT|Lava error 504/i.test(message)
        ? "Research timed out on the Lava proxy (~30s). The app uses a lighter pipeline when ANTHROPIC_API_KEY is unset — try again, or add ANTHROPIC_API_KEY for direct Claude (most reliable)."
        : message;
    return NextResponse.json({ error: publicMsg }, { status: 500 });
  }
}
