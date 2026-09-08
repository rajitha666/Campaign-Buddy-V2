import type { Prisma, PrismaClient, SalesFieldDefinition, SalesFieldScope } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError, validationError } from "./apiResponse";
import { coerceFieldValue, serializeDefinition } from "./salesFields";

// Shared read/write helpers for SalesFieldValue rows, used by both the mobile
// promoter routes and the admin correction route (issue #13).

type Tx = PrismaClient | Prisma.TransactionClient;

export function activeDefsForCampaign(campaignId: string, scope?: SalesFieldScope) {
  return prisma.salesFieldDefinition.findMany({
    where: { campaignId, archivedAt: null, ...(scope ? { scope } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Map of definitionId -> stored string value for a day-level slot. */
export async function dayValueMap(activationId: string, date: Date): Promise<Map<string, string>> {
  const rows = await prisma.salesFieldValue.findMany({
    where: { activationId, activationItemId: null, date },
  });
  return new Map(rows.map((r) => [r.definitionId, r.value]));
}

/** Map of definitionId -> stored string value for one product slot. */
export async function productValueMap(activationItemId: string, date: Date): Promise<Map<string, string>> {
  const rows = await prisma.salesFieldValue.findMany({
    where: { activationItemId, date },
  });
  return new Map(rows.map((r) => [r.definitionId, r.value]));
}

/** `[def + typed value]` list ready for an API response. */
export function serializeWithValues(defs: SalesFieldDefinition[], values: Map<string, string>) {
  return defs.map((d) => serializeDefinition(d, values.get(d.id) ?? null));
}

interface WriteTarget {
  activationId: string;
  activationItemId: string | null;
  date: Date;
}

/**
 * Validate `input` ({key: rawValue}) against `defs` and replace the matching
 * SalesFieldValue rows inside `tx`. A null/absent value clears the row. Unknown
 * keys are a 400. Does NOT enforce `required` — call `assertRequired` for that.
 */
export async function writeValues(
  tx: Tx,
  target: WriteTarget,
  defs: SalesFieldDefinition[],
  input: Record<string, unknown>
): Promise<void> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw validationError(`Unknown custom field "${key}"`, key);
    const coerced = coerceFieldValue(def, raw);
    if ("error" in coerced) throw validationError(coerced.error, key);

    const where = {
      definitionId: def.id,
      activationId: target.activationId,
      activationItemId: target.activationItemId,
      date: target.date,
    };
    await tx.salesFieldValue.deleteMany({ where });
    if (coerced.value !== null) {
      await tx.salesFieldValue.create({ data: { ...where, value: coerced.value } });
    }
  }
}

/**
 * Throw 422 MISSING_REQUIRED_FIELD if, after applying `incoming`, any required
 * def in `defs` would still have no value. `existing` is definitionId -> value.
 */
export function assertRequired(
  defs: SalesFieldDefinition[],
  existing: Map<string, string>,
  incoming: Record<string, unknown>
): void {
  for (const def of defs) {
    if (!def.required) continue;
    const has = Object.prototype.hasOwnProperty.call(incoming, def.key)
      ? incoming[def.key] !== null && incoming[def.key] !== undefined && incoming[def.key] !== ""
      : existing.has(def.id);
    if (!has) {
      throw new ApiError(422, "MISSING_REQUIRED_FIELD", `"${def.label}" is required`, def.key);
    }
  }
}
