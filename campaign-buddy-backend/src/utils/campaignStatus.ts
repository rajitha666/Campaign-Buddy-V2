import { CampaignStatus } from "@prisma/client";

// Confirmed v3 (Backend Spec v3 §5.8): status is a stored column, auto-recomputed
// from startDate/endDate whenever the campaign is read or written. This function
// is the single source of truth for that computation — call it, then only persist
// the result if it actually differs from the stored value (see campaigns.routes.ts).
export function computeCampaignStatus(startDate: Date, endDate: Date, now: Date = new Date()): CampaignStatus {
  if (now < startDate) return "upcoming";
  if (now > endDate) return "ended";
  return "active";
}
