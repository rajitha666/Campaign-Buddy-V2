import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../utils/prisma";
import { computeLicenseUsage, capsOf } from "../utils/licenseUsage";
import { LICENSE_PERIODS, periodStart } from "../utils/licensePeriods";

// In-process daily snapshot of per-campaign license usage. For every campaign
// that has not ended, records the current week and current month rows, keeping
// the PEAK value seen for each group during that period (so a mid-period
// replacement reads as one concurrent seat, and a later dip never lowers the
// recorded figure). See docs/license-usage-spec.md.

export async function captureLicenseSnapshots(now: Date = new Date()): Promise<number> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { not: "ended" } },
    select: {
      id: true,
      licensePromoterCap: true,
      licenseSupervisorCap: true,
      licenseAdminCap: true,
      licenseSponsorCap: true,
    },
  });

  let written = 0;
  for (const campaign of campaigns) {
    const usage = await computeLicenseUsage(campaign.id);
    const caps = capsOf(campaign);

    for (const period of LICENSE_PERIODS) {
      const start = periodStart(period, now);
      const existing = await prisma.campaignLicenseUsageSnapshot.findUnique({
        where: { campaignId_period_periodStart: { campaignId: campaign.id, period, periodStart: start } },
      });

      const peak = {
        promoterUsed: Math.max(existing?.promoterUsed ?? 0, usage.promoter),
        supervisorUsed: Math.max(existing?.supervisorUsed ?? 0, usage.supervisor),
        adminUsed: Math.max(existing?.adminUsed ?? 0, usage.admin),
        sponsorUsed: Math.max(existing?.sponsorUsed ?? 0, usage.sponsor),
        promoterCap: caps.promoter,
        supervisorCap: caps.supervisor,
        adminCap: caps.admin,
        sponsorCap: caps.sponsor,
      };

      await prisma.campaignLicenseUsageSnapshot.upsert({
        where: { campaignId_period_periodStart: { campaignId: campaign.id, period, periodStart: start } },
        create: { campaignId: campaign.id, period, periodStart: start, ...peak },
        update: peak,
      });
      written += 1;
    }
  }
  return written;
}

let task: ScheduledTask | null = null;

// Wired from server.ts only (never app.ts) so importing the Express app in tests
// doesn't spawn a timer. Set LICENSE_SNAPSHOT_DISABLED=1 to opt out entirely.
export function startLicenseSnapshotJob(): void {
  if (process.env.LICENSE_SNAPSHOT_DISABLED === "1") return;
  if (task) return;

  // Catch-up run on boot so a restarted server backfills the current periods.
  captureLicenseSnapshots().catch((err) =>
    console.error("[license-snapshot] boot run failed:", err)
  );

  // 00:15 every day, Asia/Colombo.
  task = cron.schedule(
    "15 0 * * *",
    () => {
      captureLicenseSnapshots()
        .then((n) => console.log(`[license-snapshot] captured ${n} snapshot rows`))
        .catch((err) => console.error("[license-snapshot] scheduled run failed:", err));
    },
    { timezone: "Asia/Colombo" }
  );
}
