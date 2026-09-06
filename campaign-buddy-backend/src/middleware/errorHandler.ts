import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
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

  // Map the Prisma errors that are really client mistakes onto proper 4xx codes
  // instead of a blanket 500 — keeps the CRUD endpoints honest.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found" } });
      return;
    }
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ");
      res.status(409).json({
        error: { code: "DUPLICATE", message: target ? `A record with this ${target} already exists` : "Duplicate value" },
      });
      return;
    }
    if (err.code === "P2003") {
      res.status(409).json({
        error: { code: "IN_USE", message: "This record is referenced by other data and cannot be deleted" },
      });
      return;
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request body has missing or unexpected fields" },
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: { code: "SERVER_ERROR", message: "Something went wrong." } });
}
