import type { NextFunction, Request, Response } from "express";

// Personal / HR details that exist only on the Staff model. Many portal routes embed whole staff rows
// (`include: { staff: true }`), so instead of trusting every route to remember, anyone who is not a
// head-office admin gets these keys removed from every JSON response.
export const HR_ONLY_KEYS = new Set([
  "nic", "dateOfBirth", "gender", "permanentAddress", "currentAddress",
  "emergencyContactName", "emergencyContactPhone",
  "bankAccountName", "bankName", "bankAccountNumber", "bankBranch",
]);

export const canReadHr = (roleId?: string) => roleId === "adm" || roleId === "usr";

export function stripHrFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripHrFields) as unknown as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!HR_ONLY_KEYS.has(k)) out[k] = stripHrFields(v);
    }
    return out as T;
  }
  return value; // primitives, Dates and class instances pass through untouched
}

// Mount after userAuth (needs req.user). Admins ("adm", "usr") are untouched.
export function restrictHrFields(req: Request, res: Response, next: NextFunction) {
  if (canReadHr(req.user?.roleId)) return next();
  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(stripHrFields(body));
  next();
}
