// Thin wrapper around the Anthropic Messages API — scaffolding for future
// AI-assisted features (report summaries, anomaly flags, etc). No route or
// job calls this yet; it exists so the first real feature doesn't have to
// wire up config/auth/error-handling from scratch.
//
// Configuration (all via env — see .env.example):
//   AI_ENABLED          "1" to actually call Anthropic; anything else = no-op
//   ANTHROPIC_API_KEY   secret key, never sent to any client
//   AI_MODEL            model id (default "claude-sonnet-5")
//
// Mirrors the disabled-until-configured pattern in utils/githubIssues.ts.

export function aiEnabled(): boolean {
  return process.env.AI_ENABLED === "1";
}

/** True when we have everything needed to actually call the API. */
export function aiConfigured(): boolean {
  return Boolean(aiEnabled() && process.env.ANTHROPIC_API_KEY);
}

export interface GenerateTextOptions {
  system?: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Send a single-turn prompt to Claude and return the text response. Throws
 * on missing config or any non-2xx/transport error — callers decide how to
 * surface that (fail the request, fall back to non-AI behavior, etc).
 */
export async function generateText({ system, prompt, maxTokens = 1024 }: GenerateTextOptions): Promise<string> {
  if (!aiConfigured()) {
    throw new Error("AI integration is not configured");
  }
  const model = process.env.AI_MODEL || "claude-sonnet-5";

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach Anthropic API: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`Anthropic API responded ${res.status}: ${detail || res.statusText}`);
  }

  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const textBlock = json.content?.find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Anthropic API returned no text content");
  return textBlock.text;
}
