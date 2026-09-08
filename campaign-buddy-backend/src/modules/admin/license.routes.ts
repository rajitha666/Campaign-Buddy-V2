import { Router } from "express";
import { LicenseUsagePeriod, Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess } from "../../middleware/campaignAccess";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { computeLicenseUsage, buildLicenseReport, LICENSE_GROUPS } from "../../utils/licenseUsage";

// License usage tracking — see docs/license-usage-spec.md.
//
//   GET   /campaigns/:id/license           current usage vs caps + alert state
//   PATCH /campaigns/:id/license            set seat caps / warn threshold  (adm only)
//   GET   /campaigns/:id/license/history    stored weekly / monthly snapshots
//   GET   /license/usage                    account-wide rollup across campaigns
const router = Router();

const LICENSE_CAP_FIELDS = {
  promoterCap: "licensePromoterCap",
  supervisorCap: "licenseSupervisorCap",
  adminCap: "licenseAdminCap",
  sponsorCap: "licenseSponsorCap",
} as const;

function serializeCampaignLicense(campaign: Prisma.CampaignGetPayload<{}>, usage: Awaited<ReturnType<typeof computeLicenseUsage>>) {
  const report = buildLicenseReport(campaign, usage);
  return {
    campaignId: campaign.id,
    campaignNo: campaign.campaignNo,
    campaignName: campaign.name,
    status: campaign.status,
    warnThresholdPct: report.warnThresholdPct,
    warnThresholdIsDefault: campaign.licenseWarnThresholdPct == null,
    overallState: report.overallState,
    groups: LICENSE_GROUPS.map((g) => ({ group: g, ...report.groups[g] })),
  };
}

router.get(
  "/campaigns/:campaignId/license",
  requireCampaignAccess,
  requireRole("adm", "usr"), // license data is for admin personas only (§ design decision 7)
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
    if (!campaign) throw notFound("Campaign");
    const usage = await computeLicenseUsage(campaign.id);
    res.json(ok(serializeCampaignLicense(campaign, usage)));
  })
);

router.patch(
  "/campaigns/:campaignId/license",
  requireCampaignAccess,
  requireRole("adm"), // cap editing is Super Admin only (usr keeps read access)
  validate({ body: s.licenseUpdate }),
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId } });
    if (!campaign) throw notFound("Campaign");

    const body = req.body as Record<string, unknown>;
    const data: Prisma.CampaignUpdateInput = {};
    for (const [key, column] of Object.entries(LICENSE_CAP_FIELDS)) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[column] = body[key];
    }
    if (body.warnThresholdPct !== undefined) {
      data.licenseWarnThresholdPct = body.warnThresholdPct as number | null;
    }

    const updated = await prisma.campaign.update({ where: { id: campaign.id }, data });
    const usage = await computeLicenseUsage(updated.id);
    res.json(ok(serializeCampaignLicense(updated, usage)));
  })
);

router.get(
  "/campaigns/:campaignId/license/history",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const periodParam = req.query.period;
    const period: LicenseUsagePeriod | undefined =
      periodParam === "week" || periodParam === "month" ? periodParam : undefined;
    const limit = Math.min(Number(req.query.limit) || 26, 200);

    const rows = await prisma.campaignLicenseUsageSnapshot.findMany({
      where: { campaignId: req.params.campaignId, ...(period ? { period } : {}) },
      orderBy: [{ periodStart: "desc" }],
      take: limit,
    });
    res.json(okList(rows, rows.length));
  })
);

// Account-wide rollup. adm sees every campaign; usr sees the campaigns they hold
// a grant on (same rule as GET /campaigns). `?state=` filters to campaigns whose
// overall alert state is at least that severe.
const STATE_MIN_RANK: Record<string, number> = { ok: 0, warn: 1, at: 2, over: 3 };

router.get(
  "/license/usage",
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const where =
      req.user!.roleId === "adm"
        ? {}
        : { accessGrants: { some: { userId: req.user!.sub } } };
    const campaigns = await prisma.campaign.findMany({
      where,
      include: { client: true },
      orderBy: [{ startDate: "desc" }],
    });

    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const usage = await computeLicenseUsage(c.id);
        const serialized = serializeCampaignLicense(c, usage);
        return { ...serialized, clientName: c.client.clientName };
      })
    );

    const stateFilter = req.query.state as string | undefined;
    const filtered =
      stateFilter && STATE_MIN_RANK[stateFilter] !== undefined
        ? rows.filter((r) => STATE_MIN_RANK[r.overallState] >= STATE_MIN_RANK[stateFilter])
        : rows;

    res.json(okList(filtered, filtered.length));
  })
);

export default router;
