import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { staffAuth } from "../../middleware/staffAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";

const router = Router();

router.post(
  "/auth/login",
  validate({ body: s.login }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username: string; password: string };

    const staff = await prisma.staff.findUnique({ where: { mobileUsername: username } });
    if (!staff || staff.status !== "active" || !(await bcrypt.compare(password, staff.passwordHash))) {
      throw new ApiError(401, "TOKEN_EXPIRED", "Invalid credentials");
    }

    const accessToken = jwt.sign(
      { sub: staff.id, type: "staff", userType: staff.userType },
      process.env.STAFF_JWT_SECRET as string,
      { expiresIn: Number(process.env.STAFF_JWT_EXPIRES_IN || 86400) }
    );

    const rawRefresh = crypto.randomUUID();
    const tokenHash = crypto.createHash("sha256").update(rawRefresh).digest("hex");
    const ttlDays = Number(process.env.STAFF_REFRESH_TOKEN_TTL_DAYS || 30);
    await prisma.staffRefreshToken.create({
      data: { staffId: staff.id, tokenHash, expiresAt: new Date(Date.now() + ttlDays * 86400000) },
    });

    res.json(ok({ accessToken, refreshToken: rawRefresh }));
  })
);

router.post(
  "/auth/refresh",
  validate({ body: s.refresh }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const stored = await prisma.staffRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!stored) throw new ApiError(401, "TOKEN_EXPIRED", "Refresh token invalid or expired");

    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: stored.staffId } });
    const accessToken = jwt.sign(
      { sub: staff.id, type: "staff", userType: staff.userType },
      process.env.STAFF_JWT_SECRET as string,
      { expiresIn: Number(process.env.STAFF_JWT_EXPIRES_IN || 86400) }
    );
    res.json(ok({ accessToken }));
  })
);

// Stub — no email/SMS delivery wired up yet (Backend Spec v3 §8). Always the same generic response.
router.post(
  "/auth/forgot-password",
  asyncHandler(async (_req, res) => {
    res.json(ok({ message: "If an account exists for that username, password reset instructions have been sent." }));
  })
);

router.post(
  "/auth/logout",
  staffAuth,
  asyncHandler(async (req, res) => {
    await prisma.staffRefreshToken.updateMany({
      where: { staffId: req.staff!.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  })
);

export default router;
