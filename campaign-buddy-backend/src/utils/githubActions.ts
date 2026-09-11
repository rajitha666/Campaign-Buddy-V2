// Latest CI run status for the portal's "System Status" page.
//
// Reuses the same GITHUB_TOKEN + GITHUB_ISSUES_REPO env vars as the issue-
// reporting integration (utils/githubIssues.ts) — same repo, same PAT — but
// the PAT's fine-grained permissions need "Actions: Read" added alongside
// "Issues: Read and write" for this to work.

export interface CiJobStatus {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | skipped | null
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string;
}

export interface CiRunStatus {
  runId: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headSha: string;
  headCommitMessage: string | null;
  createdAt: string;
  updatedAt: string;
  jobs: CiJobStatus[];
}

const WORKFLOW_FILE = "ci.yml";
const CACHE_TTL_MS = 30_000;

let cache: { at: number; data: CiRunStatus | null } | null = null;

/** Test-only: clear the in-memory cache between cases that stub `fetch` differently. */
export function resetCiStatusCache(): void {
  cache = null;
}

/** True when we have everything needed to call the Actions API. */
export function githubActionsConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_TOKEN && /^[^/\s]+\/[^/\s]+$/.test(process.env.GITHUB_ISSUES_REPO || "")
  );
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "campaign-buddy-backend",
  };
}

/**
 * Latest run of .github/workflows/ci.yml on `main`, with its per-job status.
 * Returns null if the workflow has never run. Throws on a transport/API
 * error — the caller decides how to surface that.
 *
 * Cached briefly so an admin refreshing the status page doesn't burn GitHub's
 * rate limit or add API latency on every load.
 */
export async function latestCiRun(): Promise<CiRunStatus | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!githubActionsConfigured()) {
    throw new Error("GitHub Actions integration is not configured");
  }
  const repo = process.env.GITHUB_ISSUES_REPO as string;
  const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";

  let runsRes: Response;
  try {
    runsRes = await fetch(
      `${apiBase}/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&per_page=1`,
      { headers: ghHeaders() }
    );
  } catch (err) {
    throw new Error(`Could not reach GitHub: ${(err as Error).message}`);
  }
  if (!runsRes.ok) {
    throw new Error(`GitHub responded ${runsRes.status} listing workflow runs`);
  }
  const runsJson = (await runsRes.json()) as { workflow_runs?: Record<string, any>[] };
  const run = runsJson.workflow_runs?.[0];
  if (!run) {
    cache = { at: Date.now(), data: null };
    return null;
  }

  const jobsRes = await fetch(`${apiBase}/repos/${repo}/actions/runs/${run.id}/jobs`, {
    headers: ghHeaders(),
  });
  if (!jobsRes.ok) {
    throw new Error(`GitHub responded ${jobsRes.status} listing run jobs`);
  }
  const jobsJson = (await jobsRes.json()) as { jobs: Record<string, any>[] };

  const data: CiRunStatus = {
    runId: run.id,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    headSha: run.head_sha,
    headCommitMessage: run.head_commit?.message?.split("\n")[0] ?? null,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    jobs: jobsJson.jobs.map((j) => ({
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      htmlUrl: j.html_url,
    })),
  };

  cache = { at: Date.now(), data };
  return data;
}
