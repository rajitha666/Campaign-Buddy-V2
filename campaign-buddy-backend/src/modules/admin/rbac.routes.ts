import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, validationError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";

// Entire file is [adm] only — RBAC administration (Spec v3 §4.2).
const router = Router();
router.use(requireRole("adm"));

router.get("/users", asyncHandler(async (_req, res) => {
  const rows = await prisma.user.findMany({ include: { role: true } });
  res.json(okList(rows, rows.length)); // passwordHash omitted globally (src/utils/prisma.ts)
}));

router.post("/users", asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body as any;
  if (!password) throw validationError("password is required", "password");
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
  const created = await prisma.user.create({ data: { ...rest, passwordHash } });
  res.status(201).json(ok(created)); // passwordHash omitted globally (src/utils/prisma.ts)
}));

router.patch("/users/:id", asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body as any;
  const data: any = { ...rest };
  if (password) data.passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
  const updated = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(ok(updated)); // passwordHash omitted globally (src/utils/prisma.ts)
}));

router.get("/users/:id/campaign-access", asyncHandler(async (req, res) => {
  const rows = await prisma.campaignAccessGrant.findMany({ where: { userId: req.params.id }, include: { campaign: true } });
  res.json(okList(rows, rows.length));
}));

// No Campaigns/Distributors/Brands multi-select on user creation (Admin Panel Spec
// v3 §3.14) — access is granted here, per campaign, one at a time.
router.post("/users/:id/campaign-access", asyncHandler(async (req, res) => {
  const { campaignId, scopeType, outletIds } = req.body as { campaignId: string; scopeType: "all" | "subset"; outletIds?: string[] };
  if (scopeType === "subset" && (!outletIds || outletIds.length === 0)) {
    throw validationError("outletIds is required when scopeType is 'subset'", "outletIds");
  }
  const created = await prisma.campaignAccessGrant.create({
    data: { userId: req.params.id, campaignId, scopeType, outletIds: scopeType === "subset" ? outletIds! : [] },
  });
  res.status(201).json(ok(created));
}));

router.delete("/users/:id/campaign-access/:campaignId", asyncHandler(async (req, res) => {
  await prisma.campaignAccessGrant.delete({ where: { userId_campaignId: { userId: req.params.id, campaignId: req.params.campaignId } } });
  res.status(204).send();
}));

router.get("/roles", asyncHandler(async (_req, res) => {
  const rows = await prisma.role.findMany();
  res.json(okList(rows, rows.length));
}));

router.post("/roles", asyncHandler(async (req, res) => {
  const created = await prisma.role.create({ data: req.body });
  res.status(201).json(ok(created));
}));

export default router;
