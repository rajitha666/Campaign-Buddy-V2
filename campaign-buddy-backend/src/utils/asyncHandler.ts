import { Request, Response, NextFunction, RequestHandler } from "express";

// Wraps an async route handler so thrown ApiErrors (or anything else) reach errorHandler.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
