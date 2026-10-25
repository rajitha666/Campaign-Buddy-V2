import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { okList, validationError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess, outletIdsAllowed } from "../../middleware/campaignAccess";
import { DELETED_ENTITIES, DeletedEntity, GLOBAL_ENTITIES, CAMPAIGN_ENTITIES } from "./deletedRegistry";

// #113 — "Recently deleted". One generic read over the soft-deleted rows, split in two
// routes only because campaign access is keyed on :campaignId. adm / usr only; supervisors
// and sponsors never reach it. Deletion is soft everywhere, so the entity tables hold the
// current state and DeletionEvent adds who did it (legacy rows have no event: deletedBy null).

const router = Router();
const MAX_PER_ENTITY = 500; // deleted sets are small; bounds the in-memory merge

async function listDeleted(opts: {
  entities: DeletedEntity[];
  entity?: string;
  q: string;
  page: number;
  pageSize: number;
  campaignId?: string;
  outletIds?: string[];
  userId: string;
  isAdm: boolean;
}) {
  const wanted = opts.entity ? opts.entities.filter((e) => e.type === opts.entity) : opts.entities;
  if (opts.entity && wanted.length === 0) throw validationError(`Unknown entity "${opts.entity}"`, "entity");

  const rows: Array<{ def: DeletedEntity; r: any }> = [];
  for (const def of wanted) {
    const found = await def.find({
      campaignId: opts.campaignId,
      outletIds: opts.outletIds,
      userId: opts.userId,
      isAdm: opts.isAdm,
      take: MAX_PER_ENTITY,
    });
    for (const r of found) rows.push({ def, r });
  }

  // Who deleted each one: the latest delete event per (type, id).
  const events = rows.length
    ? await prisma.deletionEvent.findMany({
        where: {
          action: "delete",
          OR: wanted.map((d) => ({ entityType: d.type, entityId: { in: rows.filter((x) => x.def === d).map((x) => x.r.id) } })),
        },
        orderBy: { at: "desc" },
      })
    : [];
  const latest = new Map<string, { userId: string; at: Date }>();
  for (const e of events) {
    const k = `${e.entityType}:${e.entityId}`;
    if (!latest.has(k)) latest.set(k, { userId: e.userId, at: e.at });
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([...latest.values()].map((v) => v.userId))] } },
    select: { id: true, displayName: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const q = opts.q.trim().toLowerCase();
  const out = rows
    .map(({ def, r }) => {
      const { label, context } = def.label(r);
      const ev = latest.get(`${def.type}:${r.id}`);
      const deletedAt: Date | null = def.deletedAt(r) ?? ev?.at ?? null;
      const blocked = def.parents(r).find(([, p]) => p?.deletedAt);
      return {
        entity: def.type,
        id: r.id as string,
        label,
        context: context ?? null,
        campaignId: def.campaignId ? def.campaignId(r) : null,
        deletedAt,
        deletedBy: ev ? userById.get(ev.userId) ?? { id: ev.userId, displayName: null } : null,
        canRestore: !blocked,
        blockedBy: blocked ? { code: "PARENT_DELETED", parent: blocked[0] } : null,
        restore: { method: "POST", path: def.restorePath(r) },
      };
    })
    .filter((x) => !q || `${x.label} ${x.context ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));

  const start = (opts.page - 1) * opts.pageSize;
  return { total: out.length, data: out.slice(start, start + opts.pageSize) };
}

function paging(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { page, pageSize };
}

router.get(
  "/deleted",
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { total, data } = await listDeleted({
      entities: GLOBAL_ENTITIES.map((t) => DELETED_ENTITIES[t]),
      entity: req.query.entity as string | undefined,
      q: String(req.query.q ?? ""),
      ...paging(req.query),
      userId: req.user!.sub,
      isAdm: req.user!.roleId === "adm",
    });
    res.json(okList(data, total));
  })
);

router.get(
  "/campaigns/:campaignId/deleted",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { total, data } = await listDeleted({
      entities: CAMPAIGN_ENTITIES.map((t) => DELETED_ENTITIES[t]),
      entity: req.query.entity as string | undefined,
      q: String(req.query.q ?? ""),
      ...paging(req.query),
      campaignId: req.params.campaignId,
      outletIds: outletIdsAllowed(req),
      userId: req.user!.sub,
      isAdm: req.user!.roleId === "adm",
    });
    res.json(okList(data, total));
  })
);

export default router;
