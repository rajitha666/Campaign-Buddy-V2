import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { PHOTO_MAX_BYTES } from "../../utils/meta";
import { ok, okList, notFound, ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { normalizePhoneField } from "../../utils/phone";
import { imageExtension, imageFileFilter } from "../../utils/imageUpload";
import { restoreSoftDeleted, clearMarker, parentDeleted } from "./restore";

const router = Router();

// #110 — undo for the soft deletes below. Same roles as DELETE; 404 unless the row is
// currently deleted; 409 PARENT_DELETED if its parent is still deleted (never cascades up).
// sku / outletNo are unique among LIVE rows only, so a code re-used meanwhile is a 409.
const codeInUse = (what: string) => ({ code: "CODE_IN_USE", message: `That ${what} is now used by another record` });
function restoreHandler(
  entity: string, delegate: any,
  parents: (row: any) => Promise<Array<[string, { deletedAt?: Date | null } | null | undefined]>> = async () => [],
  conflict?: { code: string; message: string }
) {
  return asyncHandler(async (req, res) => {
    const out = await restoreSoftDeleted({
      entity,
      load: () => delegate.findUnique({ where: { id: req.params.id } }),
      guard: async (row) => parentDeleted(...(await parents(row))),
      update: (row) => clearMarker(delegate, row.id, "deletedAt", entity),
      conflict,
    });
    res.json(ok(out));
  });
}

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
      cb(null, `${req.params.id}-${Date.now()}${imageExtension(file.mimetype)}`);
    },
  }),
  limits: { fileSize: PHOTO_MAX_BYTES },
  fileFilter: imageFileFilter,
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

router.post("/clients/:id/restore", requireRole("adm", "usr"), restoreHandler("Client", prisma.client));

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

router.post("/brands/:id/restore", requireRole("adm", "usr"), restoreHandler("Brand", prisma.brand, async (r) => [["client", await prisma.client.findUnique({ where: { id: r.clientId } })]]));

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
router.post("/items/:id/restore", requireRole("adm", "usr"), restoreHandler("Item", prisma.item, async (r) => [["brand", await prisma.brand.findUnique({ where: { id: r.brandId } })]], codeInUse("SKU")));
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
router.get("/cities", asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const rows = await prisma.city.findMany({
    where: { deletedAt: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) },
  });
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

router.post("/cities/:id/restore", requireRole("adm", "usr"), restoreHandler("City", prisma.city));

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

router.post("/outlets/:id/restore", requireRole("adm", "usr"), restoreHandler("Outlet", prisma.outlet, async (r) => [["city", await prisma.city.findUnique({ where: { id: r.cityId } })]], codeInUse("outlet number")));

// ---- Distributor Points ----
router.get("/distributor-points", asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const rows = await prisma.distributorPoint.findMany({
    where: { deletedAt: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) },
  });
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

router.post("/distributor-points/:id/restore", requireRole("adm", "usr"), restoreHandler("Distributor point", prisma.distributorPoint, async (r) => [["city", await prisma.city.findUnique({ where: { id: r.cityId } })]]));

export default router;
