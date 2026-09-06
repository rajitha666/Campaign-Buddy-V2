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

export const ok = (data: unknown) => ({ data });
export const okList = (data: unknown[], total: number) => ({ data, meta: { total } });

// Common shortcuts
export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const validationError = (message: string, field?: string) =>
  new ApiError(400, "VALIDATION_ERROR", message, field);
export const forbidden = (code: string, message: string) => new ApiError(403, code, message);
