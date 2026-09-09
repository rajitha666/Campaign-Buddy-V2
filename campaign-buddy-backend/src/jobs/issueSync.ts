import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../utils/prisma";
import { githubConfigured } from "../utils/githubIssues";
import { syncIssueReport } from "../utils/issueReports";

// Retry the GitHub push for issue reports that never made it across — because
// the integration was off / misconfigured when they were filed, or GitHub was
// briefly unreachable. See docs/issue-reporting-spec.md.

const MAX_ATTEMPTS = 8; // ~ stop hammering a permanently-broken config

export async function retryPendingIssueReports(): Promise<number> {
  if (!githubConfigured()) return 0;

  const stuck = await prisma.issueReport.findMany({
    where: {
      syncStatus: { in: ["pending", "failed"] },
      syncAttempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: [{ createdAt: "asc" }],
    take: 50,
  });

  let synced = 0;
  for (const report of stuck) {
    const updated = await syncIssueReport(report);
    if (updated.syncStatus === "synced") synced += 1;
  }
  return synced;
}

let task: ScheduledTask | null = null;

// Wired from server.ts only (never app.ts) so importing the Express app in tests
// doesn't spawn a timer. Set ISSUE_SYNC_DISABLED=1 to opt out entirely.
export function startIssueSyncJob(): void {
  if (process.env.ISSUE_SYNC_DISABLED === "1") return;
  if (task) return;

  // Catch-up run on boot so a restart flushes anything queued while GitHub was
  // unconfigured or down.
  retryPendingIssueReports().catch((err) =>
    console.error("[issue-sync] boot run failed:", err)
  );

  // Every hour, on the hour.
  task = cron.schedule("0 * * * *", () => {
    retryPendingIssueReports()
      .then((n) => {
        if (n > 0) console.log(`[issue-sync] pushed ${n} queued issue report(s) to GitHub`);
      })
      .catch((err) => console.error("[issue-sync] scheduled run failed:", err));
  });
}
