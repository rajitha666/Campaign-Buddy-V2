import { Campaign } from "@prisma/client";
import { prisma } from "./prisma";

// License usage tracking — see docs/license-usage-spec.md.
//
// Per campaign, four "seat" groups are metered against a configurable cap. A
// seat is counted when an account is *assigned* to the campaign (provisioning is
// the cost — login/activity is irrelevant):
//
//   promoter    — a promoter Staff on an Activation in the campaign
//   supervisor  — a supervisor Staff on an Activation (as promoter or supervisor
//                 slot) OR a portal User with role `supervisor` holding a
//                 CampaignAccessGrant; the same person linked across both
//                 (Staff.linkedUserId) is counted once
//   admin       — a portal User with role `adm` or `usr` holding a grant
//   sponsor     — a portal User with role `sponsor` holding a grant
//
// Limits are soft: over-cap never blocks an assignment, it only changes the
// reported alert state.

export const LICENSE_GROUPS = ["promoter", "supervisor", "admin", "sponsor"] as const;
export type LicenseGroup = (typeof LICENSE_GROUPS)[number];

export type LicenseUsageCounts = Record<LicenseGroup, number>;
export type LicenseGroupState = "ok" | "warn" | "at" | "over";

const ADMIN_ROLE_IDS = ["adm", "usr"];

// Global fallback warn threshold (percent) when a campaign has no override.
export function defaultWarnThresholdPct(): number {
  const raw = Number(process.env.LICENSE_WARN_THRESHOLD_PCT);
  return Number.isFinite(raw) && raw >= 1 && raw <= 99 ? Math.floor(raw) : 80;
}

export function effectiveWarnThresholdPct(campaign: Pick<Campaign, "licenseWarnThresholdPct">): number {
  return campaign.licenseWarnThresholdPct ?? defaultWarnThresholdPct();
}

export function groupState(used: number, cap: number, warnPct: number): LicenseGroupState {
  if (used > cap) return "over";
  if (used === cap && cap > 0) return "at";
  if (cap > 0 && used >= Math.ceil((warnPct / 100) * cap)) return "warn";
  return "ok";
}

// Worst state wins across the four groups.
const STATE_RANK: Record<LicenseGroupState, number> = { ok: 0, warn: 1, at: 2, over: 3 };
export function overallState(states: LicenseGroupState[]): LicenseGroupState {
  return states.reduce((worst, s) => (STATE_RANK[s] > STATE_RANK[worst] ? s : worst), "ok" as LicenseGroupState);
}

// Count the seats currently used by each group for one campaign.
export async function computeLicenseUsage(campaignId: string): Promise<LicenseUsageCounts> {
  const [promoterStaff, supervisorStaff, grants] = await Promise.all([
    prisma.staff.findMany({
      where: {
        userType: "promoter",
        OR: [{ activations: { some: { campaignId } } }, { supervising: { some: { campaignId } } }],
      },
      select: { id: true },
    }),
    prisma.staff.findMany({
      where: {
        userType: "supervisor",
        OR: [{ activations: { some: { campaignId } } }, { supervising: { some: { campaignId } } }],
      },
      select: { id: true, linkedUserId: true },
    }),
    prisma.campaignAccessGrant.findMany({
      where: { campaignId },
      select: { userId: true, user: { select: { roleId: true } } },
    }),
  ]);

  const supervisorUserIds = new Set(
    grants.filter((g) => g.user.roleId === "supervisor").map((g) => g.userId)
  );
  const adminUserIds = new Set(
    grants.filter((g) => ADMIN_ROLE_IDS.includes(g.user.roleId)).map((g) => g.userId)
  );
  const sponsorUserIds = new Set(
    grants.filter((g) => g.user.roleId === "sponsor").map((g) => g.userId)
  );

  // De-dupe supervisors: a supervisor Staff whose linkedUserId also has a
  // supervisor grant is the same person — count the Staff row, drop the user.
  const linkedSupervisorUserIds = new Set(
    supervisorStaff.map((s) => s.linkedUserId).filter((v): v is string => !!v)
  );
  let supervisor = supervisorStaff.length;
  for (const uid of supervisorUserIds) {
    if (!linkedSupervisorUserIds.has(uid)) supervisor += 1;
  }

  return {
    promoter: promoterStaff.length,
    supervisor,
    admin: adminUserIds.size,
    sponsor: sponsorUserIds.size,
  };
}

export function capsOf(campaign: Pick<
  Campaign,
  "licensePromoterCap" | "licenseSupervisorCap" | "licenseAdminCap" | "licenseSponsorCap"
>): LicenseUsageCounts {
  return {
    promoter: campaign.licensePromoterCap,
    supervisor: campaign.licenseSupervisorCap,
    admin: campaign.licenseAdminCap,
    sponsor: campaign.licenseSponsorCap,
  };
}

export interface LicenseGroupReport {
  used: number;
  cap: number;
  pct: number; // 0-based percentage, rounded; cap 0 => 0
  state: LicenseGroupState;
}

// Assemble the per-group + overall view used by the API responses.
export function buildLicenseReport(
  campaign: Pick<
    Campaign,
    | "licensePromoterCap"
    | "licenseSupervisorCap"
    | "licenseAdminCap"
    | "licenseSponsorCap"
    | "licenseWarnThresholdPct"
  >,
  usage: LicenseUsageCounts
): {
  warnThresholdPct: number;
  groups: Record<LicenseGroup, LicenseGroupReport>;
  overallState: LicenseGroupState;
} {
  const warnPct = effectiveWarnThresholdPct(campaign);
  const caps = capsOf(campaign);
  const groups = {} as Record<LicenseGroup, LicenseGroupReport>;
  for (const g of LICENSE_GROUPS) {
    const used = usage[g];
    const cap = caps[g];
    groups[g] = {
      used,
      cap,
      pct: cap > 0 ? Math.round((used / cap) * 100) : 0,
      state: groupState(used, cap, warnPct),
    };
  }
  return {
    warnThresholdPct: warnPct,
    groups,
    overallState: overallState(LICENSE_GROUPS.map((g) => groups[g].state)),
  };
}
