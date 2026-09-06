// Central error type + response envelope helpers — matches Backend Spec v3 §1.1 / §1.2
export class ApiError extends Error {
  statusCode: number;
  code: string;
  field?: string;

  constructor(statusCode: number, code: string, message: string, field?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }
}

// Defence in depth: password hashes must never reach a client. Several list/
// detail endpoints `include` full Staff/User rows (directly or nested), and it
// is easy to add another. Scrubbing at the single response choke point means no
// individual handler can leak a hash, regardless of what it selects.
const SECRET_KEYS = new Set(["passwordHash", "tokenHash"]);

function scrub<T>(value: T, seen = new WeakSet<object>()): T {
  if (Array.isArray(value)) return value.map((v) => scrub(v, seen)) as unknown as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    if (seen.has(value)) return value;
    seen.add(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) delete (value as Record<string, unknown>)[key];
      else scrub((value as Record<string, unknown>)[key], seen);
    }
  }
  return value;
}

export const ok = (data: unknown) => ({ data: scrub(data) });
export const okList = (data: unknown[], total: number) => ({ data: scrub(data), meta: { total } });

// Common shortcuts
export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const validationError = (message: string, field?: string) =>
  new ApiError(400, "VALIDATION_ERROR", message, field);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
