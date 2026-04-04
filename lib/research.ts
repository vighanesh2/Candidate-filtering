import { tavily } from "@tavily/core";
import { supabaseAdmin } from "./supabase";
import { jobs } from "./jobs";
import type { AIParsed } from "./screen";
import { callAnthropicMessages } from "./claude-client";

/** Lava's forward runs on a ~30s serverless cap; without ANTHROPIC_API_KEY we must stay under it. */
function useLavaSafeMode(): boolean {
  return !process.env.ANTHROPIC_API_KEY?.trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResearchSource = {
  attempted: boolean;
  success: boolean;
  summary: string;
  note?: string;
};

export type ResearchProfile = {
  linkedin: ResearchSource;
  github: ResearchSource;
  portfolio: ResearchSource;
  twitter: ResearchSource;
  discrepancies: string[];
  candidate_brief: string;
};

// ─── Tavily search ────────────────────────────────────────────────────────────

type TavilyResult = { title: string; url: string; content: string };

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

async function searchTavily(
  query: string,
  options: { includeDomains?: string[]; maxResults?: number } = {}
): Promise<TavilyResult[]> {
  const safe = useLavaSafeMode();
  try {
    const res = await tavilyClient.search(query, {
      searchDepth: safe ? "basic" : "advanced",
      maxResults: safe
        ? Math.min(options.maxResults ?? 3, 2)
        : (options.maxResults ?? 3),
      ...(options.includeDomains?.length
        ? { includeDomains: options.includeDomains }
        : {}),
    });
    return (res.results ?? []) as TavilyResult[];
  } catch (err) {
    console.error("[research] Tavily error:", err instanceof Error ? err.message : err);
    return [];
  }
}

function formatResults(results: TavilyResult[]): string {
  const cap = useLavaSafeMode() ? 450 : undefined;
  return results
    .map((r) => {
      const body = cap ? r.content.slice(0, cap) : r.content;
      return `[${r.title}]\n${r.url}\n${body}`;
    })
    .join("\n\n");
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

const ghHeaders = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});

async function fetchGitHubByUsername(
  username: string
): Promise<{ success: boolean; data: string }> {
  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, {
        headers: ghHeaders(),
        signal: AbortSignal.timeout(10000),
      }),
      fetch(
        `https://api.github.com/users/${username}/repos?sort=stars&per_page=6`,
        { headers: ghHeaders(), signal: AbortSignal.timeout(10000) }
      ),
    ]);

    if (!profileRes.ok) return { success: false, data: "" };

    const profile = await profileRes.json();
    const repos: {
      fork: boolean;
      name: string;
      stargazers_count: number;
      description: string | null;
      language: string | null;
    }[] = reposRes.ok ? await reposRes.json() : [];

    const topRepos = repos
      .filter((r) => !r.fork)
      .slice(0, 5)
      .map(
        (r) =>
          `- ${r.name} (⭐ ${r.stargazers_count}): ${r.description ?? "no description"} [${r.language ?? "?"}]`
      )
      .join("\n");

    const data = [
      `Username: ${profile.login}`,
      profile.bio ? `Bio: ${profile.bio}` : null,
      `Public repos: ${profile.public_repos} | Followers: ${profile.followers}`,
      profile.company ? `Company: ${profile.company}` : null,
      topRepos ? `\nTop repositories:\n${topRepos}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return { success: true, data };
  } catch {
    return { success: false, data: "" };
  }
}

/** Find a GitHub username by full name via the GitHub search API. */
async function findGitHubUsername(fullName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(fullName)}&per_page=1`,
      { headers: ghHeaders(), signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items?.[0]?.login as string) ?? null;
  } catch {
    return null;
  }
}

// ─── Jina reader (portfolio only) ────────────────────────────────────────────

async function fetchViaJina(url: string): Promise<string | null> {
  const safe = useLavaSafeMode();
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-No-Cache": "true" },
      signal: AbortSignal.timeout(safe ? 12_000 : 20_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, safe ? 3200 : 6000);
  } catch {
    return null;
  }
}

// ─── Claude ───────────────────────────────────────────────────────────────────

function clampPromptForLava(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Truncated — enable ANTHROPIC_API_KEY for full context.]`;
}

async function callClaude(prompt: string): Promise<string> {
  const safe = useLavaSafeMode();
  let content = safe ? clampPromptForLava(prompt, 14_000) : prompt;
  if (safe) {
    content =
      "Reply with compact JSON only (no markdown). Keep each string field under ~400 chars where possible.\n\n" +
      content;
  }
  return callAnthropicMessages({
    model: "claude-sonnet-4-6",
    max_tokens: safe ? 1200 : 2048,
    messages: [{ role: "user", content }],
  });
}

function safeParseJSON(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function researchCandidate({
  applicationId,
  fullName,
  email,
  portfolioUrl,
  roleId,
  aiParsed,
}: {
  applicationId: string;
  fullName: string;
  email: string;
  portfolioUrl: string | null;
  roleId: string;
  aiParsed: AIParsed | null;
}) {
  console.log("[research] Starting for", applicationId);

  const job = jobs.find((j) => j.id === roleId);
  const isGitHubUrl = !!portfolioUrl?.match(/github\.com/i);

  // ── Phase 1: Parallel fetches ───────────────────────────────────────────────
  //
  // LinkedIn  → Tavily search targeting linkedin.com. We can't scrape LinkedIn
  //             directly; search snippets give enough for Claude to work with.
  //
  // Twitter   → Tavily search targeting x.com / twitter.com.
  //             For full tweet history we'd need Twitter API v2 (paid).
  //
  // GitHub    → GitHub REST API if URL provided; otherwise search by name via
  //             /search/users and then fetch the top result.
  //
  // Portfolio → Jina reader for non-GitHub portfolio URLs.

  const emailLocalPart = email.split("@")[0];

  const [linkedinResults, twitterResults, githubApiResult, portfolioText] =
    await Promise.all([
      searchTavily(`"${fullName}" ${emailLocalPart}`, {
        includeDomains: ["linkedin.com"],
        maxResults: 3,
      }),
      searchTavily(`"${fullName}"`, {
        includeDomains: ["x.com", "twitter.com"],
        maxResults: 3,
      }),
      isGitHubUrl
        ? fetchGitHubByUsername(portfolioUrl!.match(/github\.com\/([^\/\?#]+)/i)![1])
        : findGitHubUsername(fullName).then((username) =>
            username ? fetchGitHubByUsername(username) : { success: false, data: "" }
          ),
      portfolioUrl && !isGitHubUrl ? fetchViaJina(portfolioUrl) : Promise.resolve(null),
    ]);

  // ── Phase 2: Build synthesis prompt ────────────────────────────────────────

  const sections: string[] = [
    `CANDIDATE: ${fullName} (${email})`,
    `ROLE APPLIED: ${job?.title ?? roleId} — ${job?.team ?? ""}`,
    "",
    "=== RESUME DATA (AI-extracted) ===",
    `Skills: ${(aiParsed?.skills ?? []).join(", ") || "none"}`,
    `Experience: ${aiParsed?.experience_years ?? "?"} years`,
    `Education: ${aiParsed?.education || "?"}`,
    `Past employers: ${(aiParsed?.employers ?? []).join(", ") || "none"}`,
    `Key achievements: ${(aiParsed?.achievements ?? []).join(" | ") || "none"}`,
    "",
    "=== LINKEDIN (web search snippets) ===",
    linkedinResults.length
      ? formatResults(linkedinResults)
      : "No results found. Profile may be private or name is too common.",
    "",
    "=== TWITTER / X (web search snippets) ===",
    twitterResults.length
      ? formatResults(twitterResults)
      : "No results found.",
    "",
    "=== GITHUB ===",
    githubApiResult.success
      ? githubApiResult.data
      : "No public GitHub profile found.",
  ];

  if (portfolioText) {
    sections.push("", "=== PORTFOLIO / WEBSITE ===", portfolioText);
  }

  sections.push(`

Based on all the above, return ONLY valid JSON — no markdown, no explanation:
{
  "linkedin_summary": "What the LinkedIn search results reveal about this person's background and current role. Note if the match is uncertain.",
  "github_summary": "What their GitHub profile and repos show — languages, project types, activity level. Say 'No GitHub found' if unavailable.",
  "portfolio_summary": "What their portfolio or personal website shows about their work. Say 'No portfolio found' if unavailable.",
  "twitter_summary": "Relevant posts, opinions, projects, or interests surfaced from X/Twitter. Note any signals relevant to the role. Say 'No Twitter found' if unavailable.",
  "discrepancies": [
    "Specific mismatch between the submitted resume and online profiles (e.g. job title, employer, dates, skills)"
  ],
  "candidate_brief": "3–5 sentence executive summary a hiring manager can read in under 60 seconds. Cover who this person is, their strongest qualifications for this specific role, any standout signals, and any concerns."
}`);

  // ── Phase 3: Synthesise with Claude ────────────────────────────────────────

  const raw = await callClaude(sections.join("\n"));
  const result = safeParseJSON(raw);

  if (!result) {
    console.error("[research] Malformed Claude response:", raw.slice(0, 300));
    throw new Error("Claude returned malformed JSON");
  }

  const researchProfile: ResearchProfile = {
    linkedin: {
      attempted: true,
      success: linkedinResults.length > 0,
      summary: String(result.linkedin_summary ?? ""),
      note:
        linkedinResults.length === 0
          ? "No results via web search. For verified profile data, integrate Proxycurl or the LinkedIn Partner API."
          : "Sourced from search index — reflects last crawl, not live profile.",
    },
    github: {
      attempted: true,
      success: githubApiResult.success,
      summary: String(result.github_summary ?? ""),
      note: !githubApiResult.success
        ? portfolioUrl && isGitHubUrl
          ? "GitHub URL was provided but the profile could not be fetched."
          : "No GitHub profile found by name search. Candidate may not have a public profile."
        : undefined,
    },
    portfolio: {
      attempted: !!portfolioUrl && !isGitHubUrl,
      success: !!portfolioText,
      summary: String(result.portfolio_summary ?? ""),
      note:
        portfolioUrl && !isGitHubUrl && !portfolioText
          ? "Portfolio URL provided but page could not be fetched (may be JS-rendered or blocked)."
          : undefined,
    },
    twitter: {
      attempted: true,
      success: twitterResults.length > 0,
      summary: String(result.twitter_summary ?? ""),
      note:
        twitterResults.length === 0
          ? "No results via web search. For full tweet history, integrate Twitter API v2 (Basic tier, $100/mo)."
          : "Sourced from search index — recent tweets may not appear.",
    },
    discrepancies: Array.isArray(result.discrepancies)
      ? (result.discrepancies as unknown[]).map(String).filter(Boolean)
      : [],
    candidate_brief: String(result.candidate_brief ?? ""),
  };

  const { error: updateError } = await supabaseAdmin
    .from("applications")
    .update({
      research_profile: researchProfile,
      research_completed_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    console.error("[research] Supabase update failed:", updateError.message);
    throw new Error(`Failed to save research: ${updateError.message}`);
  }

  console.log("[research] Completed for", applicationId);
  return researchProfile;
}
