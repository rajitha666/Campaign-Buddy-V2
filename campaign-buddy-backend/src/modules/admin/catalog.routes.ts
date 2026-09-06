import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";

const router = Router();

function paginate(req: any) {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 25);
  return { skip: (page - 1) * pageSize, take: pageSize };
}

// ---- Clients ----
router.get("/clients", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = search ? { clientName: { contains: search, mode: "insensitive" as const } } : {};
  const [rows, total] = await Promise.all([
    prisma.client.findMany({ where, ...paginate(req) }),
    prisma.client.count({ where }),
  ]);
  res.json(okList(rows, total));
}));
router.post("/clients", requireRole("adm", "usr"), validate({ body: s.clientCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.client.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/clients/:id", requireRole("adm", "usr"), validate({ body: s.clientUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.client.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/clients/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ---- Brands ----
router.get("/brands", asyncHandler(async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const rows = await prisma.brand.findMany({ where: clientId ? { clientId } : {} });
  res.json(okList(rows, rows.length));
}));
router.post("/brands", requireRole("adm", "usr"), validate({ body: s.brandCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.brand.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/brands/:id", requireRole("adm", "usr"), validate({ body: s.brandUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.brand.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/brands/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.brand.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ---- Items ----
router.get("/items", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
  const [rows, total] = await Promise.all([
    prisma.item.findMany({ where, include: { brand: true }, ...paginate(req) }),
    prisma.item.count({ where }),
  ]);
  res.json(okList(rows, total));
}));
router.post("/items", requireRole("adm", "usr"), validate({ body: s.itemCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.item.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/items/:id", requireRole("adm", "usr"), validate({ body: s.itemUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.item.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/items/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.item.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ---- Cities ----
router.get("/cities", asyncHandler(async (_req, res) => {
  const rows = await prisma.city.findMany();
  res.json(okList(rows, rows.length));
}));
router.post("/cities", requireRole("adm"), validate({ body: s.cityCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.city.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/cities/:id", requireRole("adm"), validate({ body: s.cityUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.city.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/cities/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.city.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ---- Outlets ----
router.get("/outlets", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
  const [rows, total] = await Promise.all([
    prisma.outlet.findMany({ where, include: { city: true }, ...paginate(req) }),
    prisma.outlet.count({ where }),
  ]);
  res.json(okList(rows, total));
}));
router.post("/outlets", requireRole("adm", "usr"), validate({ body: s.outletCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.outlet.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/outlets/:id", requireRole("adm", "usr"), validate({ body: s.outletUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.outlet.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/outlets/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.outlet.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ---- Distributor Points ----
router.get("/distributor-points", asyncHandler(async (_req, res) => {
  const rows = await prisma.distributorPoint.findMany();
  res.json(okList(rows, rows.length));
}));
router.post("/distributor-points", requireRole("adm", "usr"), validate({ body: s.distributorCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.distributorPoint.create({ data: req.body });
  res.status(201).json(ok(created));
}));
router.patch("/distributor-points/:id", requireRole("adm", "usr"), validate({ body: s.distributorUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.distributorPoint.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/distributor-points/:id", requireRole("adm"), asyncHandler(async (req, res) => {
  await prisma.distributorPoint.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

export default router;
