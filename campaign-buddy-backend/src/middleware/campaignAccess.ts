import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";
import { ApiError } from "../utils/apiResponse";
import { OutletScopeType } from "@prisma/client";

export interface ResolvedGrant {
  campaignId: string;
  scopeType: OutletScopeType;
  outletIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      campaignGrant?: ResolvedGrant;
    }
  }
}

// The single RBAC mechanism serving Admin, Supervisor, and Sponsor alike
// (Backend Spec v3 §3.3). Mount on every /admin/v1/campaigns/:campaignId/* router.
export async function requireCampaignAccess(req: Request, _res: Response, next: NextFunction) {
  const campaignId = req.params.campaignId;
  if (!req.user) return next(new ApiError(401, "TOKEN_EXPIRED", "Not authenticated"));

  if (req.user.roleId === "adm") {
    // adm bypasses CampaignAccessGrant entirely — confirmed v3, Spec §2.7/§3.3.
    req.campaignGrant = { campaignId, scopeType: "all", outletIds: [] };
    return next();
  }

  const grant = await prisma.campaignAccessGrant.findUnique({
    where: { userId_campaignId: { userId: req.user.sub, campaignId } },
  });
  if (!grant) {
    return next(new ApiError(403, "CAMPAIGN_ACCESS_DENIED", "You do not have access to this campaign"));
  }
  req.campaignGrant = { campaignId, scopeType: grant.scopeType, outletIds: grant.outletIds };
  next();
}

// undefined => no outlet filtering needed (scope is "all")
export function outletIdsAllowed(req: Request): string[] | undefined {
  const grant = req.campaignGrant;
  if (!grant || grant.scopeType === "all") return undefined;
  return grant.outletIds;
}

export function assertOutletAllowed(req: Request, outletId: string) {
  const allowed = outletIdsAllowed(req);
  if (allowed && !allowed.includes(outletId)) {
    throw new ApiError(403, "OUTLET_ACCESS_DENIED", "You do not have access to this outlet");
  }
}
