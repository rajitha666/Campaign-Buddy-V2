// #110 — shared helper for the "undo a delete" routes. Every DELETE in scope
// only sets a marker (`deletedAt` / `archivedAt`), so a restore just clears it.
// Check order: 404 -> guard (outlet 403, parent 409) -> conditional update.
import { ApiError, notFound } from "../../utils/apiResponse";

type Marker = "deletedAt" | "archivedAt";

export function parentDeleted(...parents: Array<[string, { deletedAt?: Date | null } | null | undefined]>) {
  for (const [name, row] of parents) {
    if (row?.deletedAt) {
      throw new ApiError(409, "PARENT_DELETED", `Restore the ${name} first`);
    }
  }
}

/** Clears the marker only if it is still set, so two racing Undos write once. */
export async function clearMarker<Row>(
  delegate: { updateMany: (a: any) => Promise<{ count: number }>; findUniqueOrThrow: (a: any) => Promise<Row> },
  id: string,
  marker: Marker,
  entity: string,
  extra: Record<string, unknown> = {}
): Promise<Row> {
  const res = await delegate.updateMany({ where: { id, [marker]: { not: null } }, data: { [marker]: null, ...extra } });
  if (!res.count) throw notFound(entity);
  return delegate.findUniqueOrThrow({ where: { id } });
}

export async function restoreSoftDeleted<Row extends Record<string, any>>(opts: {
  entity: string;
  /** Finds the row INCLUDING deleted ones, already scoped (campaign, id) by the caller. */
  load: () => Promise<Row | null>;
  marker?: Marker;
  guard?: (row: Row) => void | Promise<void>;
  update: (row: Row) => Promise<Row>;
  /** Turns a unique-index collision (code re-used while the row was deleted) into a 409. */
  conflict?: { code: string; message: string };
}): Promise<Row & { softDeleted: false }> {
  const marker = opts.marker ?? "deletedAt";
  const row = await opts.load();
  if (!row || row[marker] == null) throw notFound(opts.entity);
  await opts.guard?.(row);
  try {
    return { ...(await opts.update(row)), softDeleted: false as const };
  } catch (e: any) {
    if (e?.code === "P2002" && opts.conflict) throw new ApiError(409, opts.conflict.code, opts.conflict.message);
    throw e;
  }
}
