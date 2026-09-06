import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/apiResponse";

export interface UserTokenPayload {
  sub: string; // User.id
  type: "user";
  roleId: string; // 'adm' | 'usr' | 'supervisor' | 'sponsor' — confirmed v3, Spec §2.7
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
    }
  }
}

export function userAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(401, "TOKEN_EXPIRED", "Missing or malformed Authorization header"));
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.USER_JWT_SECRET as string) as UserTokenPayload;
    if (payload.type !== "user") throw new Error("wrong token type");
    req.user = payload;
    next();
  } catch {
    next(new ApiError(401, "TOKEN_EXPIRED", "Invalid or expired token"));
  }
}

// requireRole(...): every write route in the admin API lists only "adm"/"usr" —
// Supervisor/Sponsor tokens reach read routes but 403 here on any write attempt,
// enforced server-side regardless of client (portal UI) behavior.
export function requireRole(...roleIds: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roleIds.includes(req.user.roleId)) {
      return next(new ApiError(403, "READ_ONLY_ROLE", "This action requires a different role"));
    }
    next();
  };
}
