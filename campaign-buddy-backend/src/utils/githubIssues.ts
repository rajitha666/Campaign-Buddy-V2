// Mirror portal-raised issue reports to GitHub Issues.
//
// Configuration (all via env — see .env.example and docs/issue-reporting-spec.md):
//   GITHUB_ISSUES_ENABLED       "1" to actually call GitHub; anything else = no-op
//   GITHUB_ISSUES_REPO          "owner/repo" the issues are opened in
//   GITHUB_TOKEN                fine-grained PAT with Issues: read & write on that repo
//   GITHUB_ISSUES_DEFAULT_LABELS  comma-separated labels applied to every issue
//   GITHUB_API_URL              override for GitHub Enterprise (default api.github.com)
//
// The portal never sees the token — it POSTs to the backend, the backend calls
// GitHub. When disabled or misconfigured, callers get `configured() === false`
// and the report simply stays `pending` in the database.

import type { IssueReport } from "@prisma/client";

export interface CreatedIssue {
  number: number;
  url: string; // html_url — the page a human opens
}

export function githubIssuesEnabled(): boolean {
  return process.env.GITHUB_ISSUES_ENABLED === "1";
}

/** True when we have everything needed to actually open an issue. */
export function githubConfigured(): boolean {
  return Boolean(
    githubIssuesEnabled() &&
      process.env.GITHUB_TOKEN &&
      /^[^/\s]+\/[^/\s]+$/.test(process.env.GITHUB_ISSUES_REPO || "")
  );
}

export function defaultLabels(): string[] {
  return (process.env.GITHUB_ISSUES_DEFAULT_LABELS || "portal,from-portal")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: "bug",
  enhancement: "enhancement",
  question: "question",
};

// AGENTS.md issue-naming convention: prefix every title with the component.
function prefixedTitle(report: Pick<IssueReport, "title">): string {
  const t = report.title.trim();
  return /^\[[a-z]+]/i.test(t) ? t : `[portal] ${t}`;
}

type ReportContext = {
  page?: string;
  persona?: string;
  campaignName?: string;
  portalVersion?: string;
  userAgent?: string;
};

export function buildIssueBody(
  report: Pick<
    IssueReport,
    "body" | "category" | "severity" | "reporterName" | "context" | "createdAt"
  >
): string {
  const ctx = (report.context ?? {}) as ReportContext;
  const meta: string[] = [
    `**Reported by:** ${report.reporterName}${ctx.persona ? ` (${ctx.persona})` : ""}`,
    `**Category:** ${report.category}${report.severity ? ` · severity: ${report.severity}` : ""}`,
  ];
  if (ctx.page) meta.push(`**Portal page:** \`${ctx.page}\``);
  if (ctx.campaignName) meta.push(`**Campaign:** ${ctx.campaignName}`);
  if (ctx.portalVersion) meta.push(`**Portal version:** ${ctx.portalVersion}`);
  if (ctx.userAgent) meta.push(`**User agent:** ${ctx.userAgent}`);
  meta.push(`**Submitted:** ${new Date(report.createdAt).toISOString()}`);

  return [
    report.body.trim(),
    "",
    "---",
    "",
    ...meta,
    "",
    "_Filed from the Campaign Buddy office portal._",
  ].join("\n");
}

export function labelsFor(report: Pick<IssueReport, "category">): string[] {
  const set = new Set(defaultLabels());
  const catLabel = CATEGORY_LABEL[report.category];
  if (catLabel) set.add(catLabel);
  return [...set];
}

/**
 * Open a GitHub issue for the report. Throws on any non-2xx or transport error
 * — the caller records the message on the row and lets the retry job try again.
 */
export async function createGitHubIssue(
  report: Pick<
    IssueReport,
    "title" | "body" | "category" | "severity" | "reporterName" | "context" | "createdAt"
  >
): Promise<CreatedIssue> {
  if (!githubConfigured()) {
    throw new Error("GitHub Issues integration is not configured");
  }
  const repo = process.env.GITHUB_ISSUES_REPO as string;
  const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";

  let res: Response;
  try {
    res = await fetch(`${apiBase}/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "campaign-buddy-backend",
      },
      body: JSON.stringify({
        title: prefixedTitle(report),
        body: buildIssueBody(report),
        labels: labelsFor(report),
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach GitHub: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = (JSON.parse(text) as { message?: string }).message || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`GitHub responded ${res.status}: ${detail || res.statusText}`);
  }

  const json = (await res.json()) as { number: number; html_url: string };
  return { number: json.number, url: json.html_url };
}
