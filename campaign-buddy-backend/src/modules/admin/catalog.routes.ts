import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { normalizePhoneField } from "../../utils/phone";

const router = Router();

// Product photo storage — local disk under <repo>/uploads/items, served
// statically at /uploads (see app.ts). Simple, dependency-free choice for a
// single-server deployment; swap for object storage (S3/etc.) later if the
// app moves to multiple instances/no shared disk.
const itemImagesDir = path.join(process.cwd(), "uploads", "items");
fs.mkdirSync(itemImagesDir, { recursive: true });
const itemImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, itemImagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new ApiError(400, "VALIDATION_ERROR", "Only image files are allowed"));
    cb(null, true);
  },
});

function paginate(req: any) {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 25);
  return { skip: (page - 1) * pageSize, take: pageSize };
}

// ---- Clients ----
router.get("/clients", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = { deletedAt: null, ...(search ? { clientName: { contains: search, mode: "insensitive" as const } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.client.findMany({ where, ...paginate(req) }),
    prisma.client.count({ where }),
  ]);
  res.json(okList(rows, total));
}));
router.post("/clients", requireRole("adm", "usr"), validate({ body: s.clientCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.client.create({ data: { ...req.body, contactNumber: normalizePhoneField(req.body.contactNumber) } });
  res.status(201).json(ok(created));
}));
router.patch("/clients/:id", requireRole("adm", "usr"), validate({ body: s.clientUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: { ...req.body, contactNumber: normalizePhoneField(req.body.contactNumber) },
  });
  res.json(ok(updated));
}));
router.delete("/clients/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Client");
  await prisma.client.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));

// ---- Brands ----
router.get("/brands", asyncHandler(async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const rows = await prisma.brand.findMany({ where: { deletedAt: null, ...(clientId ? { clientId } : {}) } });
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
router.delete("/brands/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.brand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Brand");
  await prisma.brand.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));

// ---- Items ----
router.get("/items", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = { deletedAt: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) };
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
  const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Item");
  const updated = await prisma.item.update({ where: { id: req.params.id }, data: req.body });
  res.json(ok(updated));
}));
router.delete("/items/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Item");
  await prisma.item.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));
router.post(
  "/items/:id/image",
  requireRole("adm", "usr"),
  itemImageUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "VALIDATION_ERROR", "image file is required");
    const imageUrl = `/uploads/items/${req.file.filename}`;
    const updated = await prisma.item.update({ where: { id: req.params.id }, data: { imageUrl } });
    res.json(ok(updated));
  })
);

// ---- Cities ----
router.get("/cities", asyncHandler(async (_req, res) => {
  const rows = await prisma.city.findMany({ where: { deletedAt: null } });
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
router.delete("/cities/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.city.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("City");
  await prisma.city.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));

// ---- Outlets ----
router.get("/outlets", asyncHandler(async (req, res) => {
  const search = (req.query.search as string) || "";
  const where = { deletedAt: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.outlet.findMany({ where, include: { city: true }, ...paginate(req) }),
    prisma.outlet.count({ where }),
  ]);
  res.json(okList(rows, total));
}));
router.post("/outlets", requireRole("adm", "usr"), validate({ body: s.outletCreate }), asyncHandler(async (req, res) => {
  const created = await prisma.outlet.create({
    data: { ...req.body, phone: normalizePhoneField(req.body.phone), mobile: normalizePhoneField(req.body.mobile) },
  });
  res.status(201).json(ok(created));
}));
router.patch("/outlets/:id", requireRole("adm", "usr"), validate({ body: s.outletUpdate }), asyncHandler(async (req, res) => {
  const updated = await prisma.outlet.update({
    where: { id: req.params.id },
    data: { ...req.body, phone: normalizePhoneField(req.body.phone), mobile: normalizePhoneField(req.body.mobile) },
  });
  res.json(ok(updated));
}));
router.delete("/outlets/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.outlet.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Outlet");
  await prisma.outlet.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));

// ---- Distributor Points ----
router.get("/distributor-points", asyncHandler(async (_req, res) => {
  const rows = await prisma.distributorPoint.findMany({ where: { deletedAt: null } });
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
router.delete("/distributor-points/:id", requireRole("adm", "usr"), asyncHandler(async (req, res) => {
  const existing = await prisma.distributorPoint.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) throw notFound("Distributor point");
  await prisma.distributorPoint.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
}));

export default router;
