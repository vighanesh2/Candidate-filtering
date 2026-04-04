/**
 * Claude via Anthropic (direct) or Lava forward.
 * Lava runs on a short serverless limit and often returns 504 FUNCTION_INVOCATION_TIMEOUT
 * on long research prompts — set ANTHROPIC_API_KEY to call Anthropic directly.
 */

const ANTHROPIC_MESSAGES = "https://api.anthropic.com/v1/messages";
const LAVA_URL =
  "https://api.lavapayments.com/v1/forward?u=https://api.anthropic.com/v1/messages";

/** Public Anthropic model id (Lava-specific ids like claude-sonnet-4-6 are replaced when using direct API). */
const DEFAULT_DIRECT_MODEL = "claude-sonnet-4-20250514";

function parseResponse(data: unknown): string {
  const d = data as { content?: { text?: string }[] };
  const text = d?.content?.[0]?.text;
  if (!text) throw new Error(`Unexpected Claude response shape: ${JSON.stringify(data)}`);
  return text.trim();
}

export async function callAnthropicMessages(body: Record<string, unknown>): Promise<string> {
  const directKey = process.env.ANTHROPIC_API_KEY?.trim();
  const timeoutMs = 120_000;

  if (directKey) {
    // Ignore Lava-only model aliases; use a public Anthropic model id unless overridden.
    const model = process.env.ANTHROPIC_MODEL?.trim() ?? DEFAULT_DIRECT_MODEL;

    const res = await fetch(ANTHROPIC_MESSAGES, {
      method: "POST",
      headers: {
        "x-api-key": directKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }

    return parseResponse(await res.json());
  }

  const token = process.env.LAVA_FORWARD_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Set ANTHROPIC_API_KEY (recommended) or LAVA_FORWARD_TOKEN in the environment for Claude."
    );
  }

  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Lava error ${res.status}: ${errText}`);
  }

  return parseResponse(await res.json());
}
