import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";
import { ApiError } from "../utils/apiResponse";

// Runtime request validation. `validate({ body, query })` parses the named parts
// of the request against the given Zod schemas, replaces them with the parsed
// (and coerced) values, and throws a 400 VALIDATION_ERROR with the first
// offending field name on failure — matching the spec's error envelope (§1.1).
interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path.join(".") || undefined;
        return next(
          new ApiError(400, "VALIDATION_ERROR", issue?.message || "Invalid request", field)
        );
      }
      // req.query is a getter on some Express versions — assign defensively.
      try {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      } catch {
        Object.assign(req[key] as object, result.data as object);
      }
    }
    next();
  };
}
