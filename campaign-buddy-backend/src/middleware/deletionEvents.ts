import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

// #113 — records who soft-deleted or restored what, in the DeletionEvent table, without
// every handler having to remember. Mounted once on the admin router, it watches
// successful DELETE / restore / reactivate calls and derives the entity from the URL.
// Recording never fails the user's request (it logs and moves on).

type Rule = { re: RegExp; entityType: string; campaignGroup?: number; idGroup: number };

// Order matters only in that every pattern is fully anchored.
const SEG = "([^/]+)";
const RULES: Rule[] = [
  { re: new RegExp(`^/clients/${SEG}$`), entityType: "client", idGroup: 1 },
  { re: new RegExp(`^/brands/${SEG}$`), entityType: "brand", idGroup: 1 },
  { re: new RegExp(`^/items/${SEG}$`), entityType: "item", idGroup: 1 },
  { re: new RegExp(`^/cities/${SEG}$`), entityType: "city", idGroup: 1 },
  { re: new RegExp(`^/outlets/${SEG}$`), entityType: "outlet", idGroup: 1 },
  { re: new RegExp(`^/distributor-points/${SEG}$`), entityType: "distributor_point", idGroup: 1 },
  { re: new RegExp(`^/staff/${SEG}$`), entityType: "staff", idGroup: 1 },
  { re: new RegExp(`^/campaigns/${SEG}$`), entityType: "campaign", idGroup: 1, campaignGroup: 1 },
  { re: new RegExp(`^/campaigns/${SEG}/items/${SEG}$`), entityType: "campaign_item", campaignGroup: 1, idGroup: 2 },
  { re: new RegExp(`^/campaigns/${SEG}/activations/${SEG}$`), entityType: "activation", campaignGroup: 1, idGroup: 2 },
  { re: new RegExp(`^/campaigns/${SEG}/activations/${SEG}/items/${SEG}$`), entityType: "activation_item", campaignGroup: 1, idGroup: 3 },
  { re: new RegExp(`^/campaigns/${SEG}/supervisor-routes/${SEG}$`), entityType: "supervisor_route", campaignGroup: 1, idGroup: 2 },
  { re: new RegExp(`^/campaigns/${SEG}/supervisor-tasks/${SEG}$`), entityType: "supervisor_task", campaignGroup: 1, idGroup: 2 },
  { re: new RegExp(`^/campaigns/${SEG}/sales-fields/${SEG}$`), entityType: "sales_field", campaignGroup: 1, idGroup: 2 },
  { re: new RegExp(`^/campaigns/${SEG}/sales/${SEG}$`), entityType: "sales_record", campaignGroup: 1, idGroup: 2 },
];

export function classifyRequest(method: string, path: string):
  | { entityType: string; entityId: string; campaignId: string | null; action: "delete" | "restore" }
  | null {
  let action: "delete" | "restore";
  let base = path.replace(/\/+$/, "");
  if (method === "DELETE") {
    action = "delete";
  } else if (method === "POST" && /\/(restore|reactivate)$/.test(base)) {
    action = "restore";
    base = base.replace(/\/(restore|reactivate)$/, "");
  } else {
    return null;
  }
  for (const r of RULES) {
    const m = r.re.exec(base);
    if (!m) continue;
    return {
      entityType: r.entityType,
      entityId: decodeURIComponent(m[r.idGroup]),
      campaignId: r.campaignGroup ? decodeURIComponent(m[r.campaignGroup]) : null,
      action,
    };
  }
  return null;
}

export function recordDeletionEvents(req: Request, res: Response, next: NextFunction) {
  const hit = classifyRequest(req.method, req.path);
  if (hit) {
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300 || !req.user) return;
      prisma.deletionEvent
        .create({ data: { ...hit, userId: req.user.sub } })
        .catch((err) => console.error("[deletion-events] could not record", hit, err?.message));
    });
  }
  next();
}
