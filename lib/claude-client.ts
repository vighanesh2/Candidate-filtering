/**
 * Claude via Anthropic (direct) or Lava forward.
 * Lava runs on a short serverless limit and often returns 504 FUNCTION_INVOCATION_TIMEOUT
 * on long research prompts — set ANTHROPIC_API_KEY to call Anthropic directly.
 *
 * Lava only accepts models in their gateway catalog; set LAVA_ANTHROPIC_MODEL if the default
 * (claude-haiku-4-5) is wrong for your account.
 */

const ANTHROPIC_MESSAGES = "https://api.anthropic.com/v1/messages";
const LAVA_URL =
  "https://api.lavapayments.com/v1/forward?u=https://api.anthropic.com/v1/messages";

/** Model id for direct Anthropic API (see Anthropic docs). */
const DEFAULT_DIRECT_MODEL = "claude-sonnet-4-20250514";

/**
 * Default when using Lava forward — must match Lava's gateway catalog (not arbitrary Anthropic ids).
 * @see https://lava.so/docs/gateway/forward-proxy.md (Anthropic example uses claude-haiku-4-5)
 * Override with LAVA_ANTHROPIC_MODEL (e.g. claude-opus-4-0, claude-haiku-4-5-20251001).
 */
const DEFAULT_LAVA_ANTHROPIC_MODEL = "claude-haiku-4-5";

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

  // Lava validates `model` against its allowlist; legacy aliases like claude-sonnet-4-6 fail with forward_model_invalid.
  const lavaModel =
    process.env.LAVA_ANTHROPIC_MODEL?.trim() || DEFAULT_LAVA_ANTHROPIC_MODEL;
  const payload = { ...body, model: lavaModel };

  const res = await fetch(LAVA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Lava error ${res.status}: ${errText}`);
  }

  return parseResponse(await res.json());
}
