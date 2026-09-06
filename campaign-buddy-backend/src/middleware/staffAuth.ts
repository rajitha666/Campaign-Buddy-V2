import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiResponse";

export interface StaffTokenPayload {
  sub: string; // Staff.id
  type: "staff";
  userType: "promoter" | "supervisor";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: StaffTokenPayload;
    }
  }
}

export function staffAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(401, "TOKEN_EXPIRED", "Missing or malformed Authorization header"));
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.STAFF_JWT_SECRET as string) as StaffTokenPayload;
    if (payload.type !== "staff") throw new Error("wrong token type");
    req.staff = payload;
    next();
  } catch {
    next(new ApiError(401, "TOKEN_EXPIRED", "Invalid or expired token"));
  }
}
