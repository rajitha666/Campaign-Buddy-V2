import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiResponse";

// Central error formatter — every route is wrapped in asyncHandler, so any thrown
// ApiError (or unexpected error) lands here and is formatted per Backend Spec v3 §1.1.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) },
    });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong." } });
}
