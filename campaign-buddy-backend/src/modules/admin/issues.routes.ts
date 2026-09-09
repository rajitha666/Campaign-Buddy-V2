import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { githubConfigured, githubIssuesEnabled } from "../../utils/githubIssues";
import { syncIssueReport } from "../../utils/issueReports";

// Portal "Report an issue" — see docs/issue-reporting-spec.md.
//
//   POST  /issue-reports            file a report (persist, then best-effort push to GitHub)
//   GET   /issue-reports            list recent reports + integration status
//   POST  /issue-reports/:id/retry  re-attempt the GitHub push for a stuck report
//
// Super Admin + Campaign Admin only (roles adm / usr) — the button is hidden for
// supervisor / sponsor personas and the API enforces it regardless of client.
const router = Router();

const REPORTER_ROLES = ["adm", "usr"] as const;

router.post(
  "/issue-reports",
  requireRole(...REPORTER_ROLES),
  validate({ body: s.issueReportCreate }),
  asyncHandler(async (req, res) => {
    const { title, body, category, severity, context } = req.body as {
      title: string;
      body: string;
      category: "bug" | "enhancement" | "question";
      severity?: "low" | "normal" | "high" | "critical";
      context?: Record<string, string>;
    };

    const reporter = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!reporter) throw notFound("User");

    const created = await prisma.issueReport.create({
      data: {
        title,
        body,
        category,
        severity: category === "bug" ? severity ?? "normal" : null,
        context: context ?? undefined,
        reporterUserId: reporter.id,
        reporterName: reporter.displayName,
      },
    });

    // Best-effort: try the GitHub push now so the reporter gets the issue link
    // immediately. Failure just leaves the row for the retry job.
    const report = await syncIssueReport(created);

    res.status(201).json(ok(serialize(report)));
  })
);

router.get(
  "/issue-reports",
  requireRole(...REPORTER_ROLES),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await prisma.issueReport.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    });
    res.json({
      data: rows.map(serialize),
      meta: { total: rows.length, integration: integrationStatus() },
    });
  })
);

router.post(
  "/issue-reports/:id/retry",
  requireRole(...REPORTER_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.issueReport.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Issue report");
    const report = await syncIssueReport(existing);
    res.json(ok(serialize(report)));
  })
);

function serialize(r: Awaited<ReturnType<typeof prisma.issueReport.findFirstOrThrow>>) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    severity: r.severity,
    context: r.context,
    reporterName: r.reporterName,
    syncStatus: r.syncStatus,
    githubIssueNumber: r.githubIssueNumber,
    githubIssueUrl: r.githubIssueUrl,
    syncError: r.syncError,
    syncAttempts: r.syncAttempts,
    lastAttemptAt: r.lastAttemptAt,
    createdAt: r.createdAt,
  };
}

function integrationStatus() {
  return {
    enabled: githubIssuesEnabled(),
    configured: githubConfigured(),
    repo: process.env.GITHUB_ISSUES_REPO || null,
  };
}

export default router;
