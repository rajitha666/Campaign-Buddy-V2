import type { IssueReport } from "@prisma/client";
import { prisma } from "./prisma";
import { createGitHubIssue, githubConfigured } from "./githubIssues";

// Push one persisted report to GitHub and fold the result back onto the row.
// Used both inline on create (best-effort) and by the retry job. Never throws —
// the outcome is always recorded on the row and returned.
export async function syncIssueReport(report: IssueReport): Promise<IssueReport> {
  if (report.syncStatus === "synced") return report;
  if (!githubConfigured()) return report; // stays `pending`; nothing to do yet

  try {
    const issue = await createGitHubIssue(report);
    return prisma.issueReport.update({
      where: { id: report.id },
      data: {
        syncStatus: "synced",
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.url,
        syncError: null,
        syncAttempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
  } catch (err) {
    return prisma.issueReport.update({
      where: { id: report.id },
      data: {
        syncStatus: "failed",
        syncError: (err as Error).message.slice(0, 500),
        syncAttempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
  }
}
