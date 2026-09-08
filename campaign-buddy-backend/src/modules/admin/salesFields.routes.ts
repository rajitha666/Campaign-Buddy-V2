import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, validationError } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess } from "../../middleware/campaignAccess";
import { dayDate } from "../../utils/dates";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { slugifyFieldKey, coerceFieldValue, serializeDefinition } from "../../utils/salesFields";

// Admin CRUD for the campaign's custom sales-field definitions + a bulk value
// save for the portal correction screen (issue #13).
const router = Router();

async function loadOwnedField(campaignId: string, id: string) {
  const field = await prisma.salesFieldDefinition.findUnique({ where: { id } });
  if (!field || field.campaignId !== campaignId) throw notFound("Custom sales field");
  return field;
}

router.get(
  "/campaigns/:campaignId/sales-fields",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === "1" || req.query.includeArchived === "true";
    const rows = await prisma.salesFieldDefinition.findMany({
      where: { campaignId: req.params.campaignId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json(okList(rows.map((r) => serializeDefinition(r)), rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/sales-fields",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.salesFieldCreate }),
  asyncHandler(async (req, res) => {
    const { label, type, scope, options, required, sortOrder } = req.body as {
      label: string; type: "number" | "text" | "boolean" | "select";
      scope?: "day" | "product"; options?: string[]; required?: boolean; sortOrder?: number;
    };
    const key = slugifyFieldKey(label);
    if (!key) throw validationError("Label must contain at least one letter or number", "label");

    let resolvedSort = sortOrder;
    if (resolvedSort == null) {
      const last = await prisma.salesFieldDefinition.aggregate({
        where: { campaignId: req.params.campaignId },
        _max: { sortOrder: true },
      });
      resolvedSort = (last._max.sortOrder ?? 0) + 1;
    }

    try {
      const created = await prisma.salesFieldDefinition.create({
        data: {
          campaignId: req.params.campaignId,
          key,
          label,
          type,
          scope: scope ?? "day",
          options: type === "select" ? options ?? [] : [],
          required: required ?? false,
          sortOrder: resolvedSort,
        },
      });
      res.status(201).json(ok(serializeDefinition(created)));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ApiError(409, "DUPLICATE", `A field with the key "${key}" already exists on this campaign`, "label");
      }
      throw e;
    }
  })
);

router.patch(
  "/campaigns/:campaignId/sales-fields/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.salesFieldUpdate }),
  asyncHandler(async (req, res) => {
    const field = await loadOwnedField(req.params.campaignId, req.params.id);
    const body = req.body as Record<string, unknown>;

    // type / scope may only change while the field has no captured values.
    if ((body.type !== undefined && body.type !== field.type) ||
        (body.scope !== undefined && body.scope !== field.scope)) {
      const used = await prisma.salesFieldValue.count({ where: { definitionId: field.id } });
      if (used > 0) throw new ApiError(409, "IN_USE", "This field already has recorded values — its type and scope can't be changed. Archive it and add a new one.");
    }

    const nextType = (body.type as typeof field.type) ?? field.type;
    const data: Prisma.SalesFieldDefinitionUpdateInput = {};
    if (body.label !== undefined) data.label = body.label as string;
    if (body.type !== undefined) data.type = body.type as typeof field.type;
    if (body.scope !== undefined) data.scope = body.scope as typeof field.scope;
    if (body.required !== undefined) data.required = body.required as boolean;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder as number;
    if (body.options !== undefined || body.type !== undefined) {
      const opts = (body.options as string[] | undefined) ?? field.options;
      data.options = nextType === "select" ? opts : [];
    }
    if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;

    if (data.options !== undefined && nextType === "select") {
      const opts = data.options as string[];
      if (opts.length < 2) throw validationError("A dropdown field needs at least two options", "options");
    }

    const updated = await prisma.salesFieldDefinition.update({ where: { id: field.id }, data });
    res.json(ok(serializeDefinition(updated)));
  })
);

router.delete(
  "/campaigns/:campaignId/sales-fields/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const field = await loadOwnedField(req.params.campaignId, req.params.id);
    const used = await prisma.salesFieldValue.count({ where: { definitionId: field.id } });
    if (used > 0) {
      throw new ApiError(409, "IN_USE", "This field has recorded values — archive it instead of deleting.");
    }
    await prisma.salesFieldDefinition.delete({ where: { id: field.id } });
    res.status(204).send();
  })
);

// Bulk value save for the portal correction screen. `day` is a {key: value} map;
// `products` is {activationItemId: {key: value}}. A value of null clears it.
router.put(
  "/campaigns/:campaignId/sales/custom-values",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.salesFieldValuesSave }),
  asyncHandler(async (req, res) => {
    const { activationId, date, day, products } = req.body as {
      activationId: string; date: string;
      day?: Record<string, unknown>; products?: Record<string, Record<string, unknown>>;
    };

    const activation = await prisma.activation.findUnique({ where: { id: activationId } });
    if (!activation || activation.campaignId !== req.params.campaignId) throw notFound("Activation");

    const defs = await prisma.salesFieldDefinition.findMany({
      where: { campaignId: req.params.campaignId, archivedAt: null },
    });
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const when = dayDate(date);

    type Op = { definitionId: string; activationItemId: string | null; value: string | null };
    const ops: Op[] = [];

    for (const [key, raw] of Object.entries(day ?? {})) {
      const def = byKey.get(key);
      if (!def || def.scope !== "day") throw validationError(`Unknown day field "${key}"`, key);
      const c = coerceFieldValue(def, raw);
      if ("error" in c) throw validationError(c.error, key);
      ops.push({ definitionId: def.id, activationItemId: null, value: c.value });
    }

    const itemIds = Object.keys(products ?? {});
    if (itemIds.length) {
      const validItems = await prisma.activationItem.findMany({
        where: { id: { in: itemIds }, activationId },
        select: { id: true },
      });
      const validItemIds = new Set(validItems.map((i) => i.id));
      for (const [itemId, map] of Object.entries(products ?? {})) {
        if (!validItemIds.has(itemId)) throw validationError(`Product ${itemId} is not in this activation`, "products");
        for (const [key, raw] of Object.entries(map)) {
          const def = byKey.get(key);
          if (!def || def.scope !== "product") throw validationError(`Unknown product field "${key}"`, key);
          const c = coerceFieldValue(def, raw);
          if ("error" in c) throw validationError(c.error, key);
          ops.push({ definitionId: def.id, activationItemId: itemId, value: c.value });
        }
      }
    }

    await prisma.$transaction(
      ops.flatMap((op) => {
        const where = {
          definitionId: op.definitionId,
          activationId,
          activationItemId: op.activationItemId,
          date: when,
        };
        const del = prisma.salesFieldValue.deleteMany({ where });
        if (op.value === null) return [del];
        return [del, prisma.salesFieldValue.create({ data: { ...where, value: op.value } })];
      })
    );

    res.json(ok({ saved: ops.length }));
  })
);

export default router;
