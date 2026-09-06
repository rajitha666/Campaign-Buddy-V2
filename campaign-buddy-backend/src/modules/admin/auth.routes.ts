import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { userAuth } from "../../middleware/userAuth";

const router = Router();

router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) throw new ApiError(400, "VALIDATION_ERROR", "username and password required");

    const user = await prisma.user.findUnique({ where: { username }, include: { role: true } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ApiError(401, "TOKEN_EXPIRED", "Invalid credentials");
    }

    // Confirmed v3: no refresh-token flow for User — re-login required on expiry (§3.2/§8).
    const accessToken = jwt.sign(
      { sub: user.id, type: "user", roleId: user.roleId },
      process.env.USER_JWT_SECRET as string,
      { expiresIn: process.env.USER_JWT_EXPIRES_IN || "8h" } as jwt.SignOptions
    );

    res.json(ok({ accessToken, user: { id: user.id, displayName: user.displayName, roleId: user.roleId, defaultUrl: user.role.defaultUrl } }));
  })
);

router.post("/auth/logout", userAuth, asyncHandler(async (_req, res) => { res.status(204).send(); }));

export default router;
