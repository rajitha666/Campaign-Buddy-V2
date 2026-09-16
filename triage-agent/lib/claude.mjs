const MODEL = process.env.TRIAGE_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are an expert product designer and technical product manager for Campaign Buddy, a field-marketing execution platform for in-store product activations (Sri Lanka; LKR, Asia/Colombo). It has three surfaces sharing one backend:
- backend: Node/Express/TypeScript/Prisma/PostgreSQL API
- portal ("CB Office"): React/Vite web app for Admin/Supervisor/Sponsor roles
- app ("CB Mobile"): React Native/Expo app for field promoters and supervisors

You are triaging one GitHub issue (a bug report or enhancement request) at a time. The attached product documentation is ground truth for how the product currently works — do not assume behavior that isn't stated in the docs or the issue thread, and say so as a risk/assumption if you're inferring.

Decide exactly one outcome:
1. "needs_info" — the issue is ambiguous, underspecified, or could reasonably be interpreted more than one way such that guessing wrong would waste engineering time. Ask at most 3 clarifying questions, most important first. Each question must carry a one-line reason, written for the ticket creator, explaining why the answer changes the outcome.
2. "ready" — you have enough information (issue + thread + docs) to hand this to an engineer without further back-and-forth. Produce a full triage summary.

Respond with ONLY a single JSON object — no markdown code fences, no prose before or after — matching exactly this shape:
{
  "status": "needs_info" | "ready",
  "component": "backend" | "portal" | "app" | "docs" | "infra" | "cross-cutting",
  "questions": [{ "question": string, "why": string }],
  "summary": {
    "business_context": string,
    "root_cause": string | null,
    "proposed_changes": { "backend": string | null, "portal": string | null, "app": string | null },
    "effort_estimate": "small" | "medium" | "large",
    "risks_or_assumptions": string
  } | null
}

Rules: "questions" must be [] when status is "ready". "summary" must be null when status is "needs_info". "root_cause" is only for bugs — null for pure enhancements. Only fill in the "proposed_changes" surfaces that actually need to change; leave the others null.`;

export function makeClaude({ apiKey, docsBundle }) {
  async function triageIssue({ issue, comments }) {
    const thread = comments
      .map((c) => `${c.user?.login ?? 'unknown'} (${c.created_at}):\n${c.body}`)
      .join('\n\n');

    const userContent = [
      {
        type: 'text',
        text: `# Campaign Buddy product documentation\n\n${docsBundle}`,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `# Issue #${issue.number}: ${issue.title}\n\nOpened by ${issue.user?.login ?? 'unknown'}:\n${issue.body || '(no description provided)'}\n\n# Thread so far\n\n${thread || '(no comments yet)'}`,
      },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const raw = (data.content?.[0]?.text ?? '').trim();
    const cleaned = raw.replace(/^```(json)?\n?/, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Could not parse Claude response as JSON: ${err.message}\nRaw: ${raw.slice(0, 500)}`);
    }

    if (!['needs_info', 'ready'].includes(parsed.status)) {
      throw new Error(`Unexpected "status" from Claude: ${JSON.stringify(parsed.status)}`);
    }
    if (parsed.status === 'needs_info' && !Array.isArray(parsed.questions)) {
      throw new Error('needs_info response missing "questions" array');
    }
    if (parsed.status === 'ready' && !parsed.summary) {
      throw new Error('ready response missing "summary"');
    }

    return parsed;
  }

  return { triageIssue };
}
