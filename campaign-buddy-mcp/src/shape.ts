// Everything the MCP server returns passes through here. Two jobs:
//  1. Redact — the admin API returns whole Prisma rows, and Staff rows carry HR /
//     banking fields (NIC, bank account, DOB, addresses). That must never be sent
//     to an LLM provider, whatever role the service user has.
//  2. Slim — drop nulls and bookkeeping columns, and cap payload size, so tool
//     results are cheap for a model to read.

const ALWAYS_DROP = new Set([
  // secrets
  "passwordHash", "tokenHash",
  // HR / identity / banking (Staff)
  "nic", "dateOfBirth", "gender", "permanentAddress", "currentAddress",
  "emergencyContactName", "emergencyContactPhone",
  "bankAccountName", "bankName", "bankAccountNumber", "bankBranch",
  "mobileUsername",
  // bookkeeping / bulky
  "createdAt", "updatedAt", "deletedAt", "profilePictureUrl", "receivedAt",
]);

export const MAX_RESULT_CHARS = 30_000;

export function slim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(slim);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    // A Staff row: its personal phone number is PII too (outlet phones are business data).
    const isStaff = "employeeId" in src || "mobileUsername" in src;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (ALWAYS_DROP.has(k) || v === null || v === undefined) continue;
      if (isStaff && (k === "phone" || k === "linkedUserId")) continue;
      out[k] = slim(v);
    }
    return out;
  }
  return value;
}

/** Shrink the largest top-level array until the JSON fits, and say so. */
export function fit(payload: Record<string, unknown>, maxChars = MAX_RESULT_CHARS): string {
  let text = JSON.stringify(payload);
  if (text.length <= maxChars) return text;

  const arrayKeys = Object.entries(payload)
    .filter(([, v]) => Array.isArray(v))
    .sort((a, b) => (b[1] as unknown[]).length - (a[1] as unknown[]).length);
  const key = arrayKeys[0]?.[0];
  if (!key) return text.slice(0, maxChars) + '…[truncated]';

  const full = payload[key] as unknown[];
  let keep = full.length;
  while (text.length > maxChars && keep > 1) {
    keep = Math.floor(keep / 2);
    text = JSON.stringify({ ...payload, [key]: full.slice(0, keep) });
  }
  return JSON.stringify({
    ...payload,
    [key]: full.slice(0, keep),
    truncated: {
      field: key,
      shown: keep,
      available: full.length,
      hint: "Result was too large. Narrow it with dateFrom/dateTo, outletId or other filters, or page with page/pageSize.",
    },
  });
}
