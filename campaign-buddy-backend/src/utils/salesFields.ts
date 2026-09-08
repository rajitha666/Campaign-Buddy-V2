import type { SalesFieldDefinition } from "@prisma/client";

// Helpers for the admin-defined custom sales fields (issue #13).
// See docs/custom-sales-fields-spec.md for the value-encoding table.

/** "Competitor Promo?" -> "competitor_promo" — stable machine key, frozen after create. */
export function slugifyFieldKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export type FieldDefLike = Pick<SalesFieldDefinition, "key" | "label" | "type" | "options">;

/**
 * Validate + canonicalize a raw client value against its definition.
 * `null`/`""`/`undefined` mean "clear the value" and return `{ value: null }`.
 */
export function coerceFieldValue(
  def: FieldDefLike,
  raw: unknown
): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };

  switch (def.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { error: `${def.label} must be a number` };
      return { value: String(n) };
    }
    case "boolean": {
      if (raw === true || raw === "true") return { value: "true" };
      if (raw === false || raw === "false") return { value: "false" };
      return { error: `${def.label} must be true or false` };
    }
    case "select": {
      const s = String(raw);
      if (!def.options.includes(s)) return { error: `${def.label} must be one of the allowed options` };
      return { value: s };
    }
    case "text":
    default: {
      const s = String(raw);
      if (s.length > 2000) return { error: `${def.label} must be 2000 characters or fewer` };
      return { value: s };
    }
  }
}

/** Turn a stored string back into a typed value for API responses. */
export function readFieldValue(
  def: Pick<SalesFieldDefinition, "type">,
  stored: string | null | undefined
): string | number | boolean | null {
  if (stored === null || stored === undefined) return null;
  if (def.type === "number") {
    const n = Number(stored);
    return Number.isFinite(n) ? n : null;
  }
  if (def.type === "boolean") return stored === "true";
  return stored;
}

/** Shape returned to mobile + portal for one definition (+ its current value). */
export function serializeDefinition(
  def: SalesFieldDefinition,
  value?: string | null
) {
  return {
    id: def.id,
    key: def.key,
    label: def.label,
    type: def.type,
    scope: def.scope,
    options: def.options,
    required: def.required,
    sortOrder: def.sortOrder,
    archived: def.archivedAt != null,
    ...(value !== undefined ? { value: readFieldValue(def, value) } : {}),
  };
}
