// Supervisor outlet checklist (mobile). A supervisor visiting an outlet scores
// the promoter against the campaign's QA tasks: 1-5 ratings, free-text feedback
// and a configured number of outlet-setup photos.
//  - A supervisor may visit the same outlet several times a day; every check-in is
//    its own visit (AttendanceRecord.visitNo) with its own blank checklist. The
//    checklist being filled is the open visit, or — after check-out — the latest.
//  - range/feedback answers are per promoter: keyed (task, activation, day, visit),
//    so re-saving the same visit updates in place.
//  - photo answers are per OUTLET: one row per (task, supervisor, outlet, day,
//    visit), shared by every promoter that supervisor covers there in that visit
//    number, so the same display is never photographed twice.
import { Router, type Request, type Response, type NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound, validationError } from "../../utils/apiResponse";
import { dayDate } from "../../utils/dates";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { RATING_SCALE } from "../../utils/supervisorRatings";
import { imageExtension, imageFileFilter } from "../../utils/imageUpload";

const router = Router();

const PHOTO_URL_PREFIX = "/uploads/visit-photos/";
const visitPhotosDir = path.join(process.cwd(), "uploads", "visit-photos");
fs.mkdirSync(visitPhotosDir, { recursive: true });
const visitPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, visitPhotosDir),
    filename: (req, file, cb) => {
      cb(null, `${req.staff!.sub}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${imageExtension(file.mimetype)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

function removeStoredPhoto(url: string) {
  if (!url.startsWith(PHOTO_URL_PREFIX)) return;
  fs.promises.unlink(path.join(visitPhotosDir, path.basename(url))).catch(() => undefined);
}

// The visit being checklisted: an activation this supervisor is assigned to
// that is live today — the same rule as check-in eligibility.
async function loadVisit(req: Request) {
  const today = dayDate();
  const activation = await prisma.activation.findFirst({
    where: { id: req.params.assignmentId, supervisorStaffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
    include: { staff: true, outlet: true },
  });
  if (!activation) throw notFound("Assignment");
  const latest = await prisma.attendanceRecord.findFirst({
    where: { activationId: activation.id, staffId: req.staff!.sub, date: today },
    orderBy: { visitNo: "desc" },
  });
  return { activation, today, visitNo: latest?.visitNo ?? 1 };
}

type Visit = Awaited<ReturnType<typeof loadVisit>>;

const answerKey = (taskId: string, activationId: string, date: Date, visitNo: number) => ({
  taskId_activationId_date_visitNo: { taskId, activationId, date, visitNo },
});
const photoRow = (v: Visit, taskId: string, supervisorStaffId: string) => ({
  taskId, supervisorStaffId, outletId: v.activation.outletId, date: v.today, visitNo: v.visitNo,
});
const shapePhotos = (photos: { url: string; createdAt: Date }[]) =>
  photos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((p) => ({ url: p.url, uploadedAt: p.createdAt }));

router.get(
  "/me/assignments/:assignmentId/supervisor-tasks",
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(req);
    const { activation, today, visitNo } = visit;
    const tasks = await prisma.supervisorTask.findMany({
      where: { campaignId: activation.campaignId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const answers = await prisma.supervisorTaskResponse.findMany({
      where: { activationId: activation.id, date: today, visitNo, task: { taskType: { not: "photo" } } },
    });
    const photoRows = await prisma.supervisorTaskResponse.findMany({
      where: { supervisorStaffId: req.staff!.sub, outletId: activation.outletId, date: today, visitNo, task: { taskType: "photo" } },
      include: { photos: true },
    });
    const answerByTask = new Map(answers.map((r) => [r.taskId, r]));
    const photosByTask = new Map(photoRows.map((r) => [r.taskId, r.photos]));
    res.json(
      ok({
        ratingScale: RATING_SCALE,
        visitNo,
        promoter: { id: activation.staff.id, name: activation.staff.fullName },
        outlet: { id: activation.outlet.id, name: activation.outlet.name },
        tasks: tasks.map((t) => {
          let response = null;
          if (t.taskType === "photo") {
            const photos = photosByTask.get(t.id);
            if (photos) response = { rating: null, feedback: null, photos: shapePhotos(photos) };
          } else {
            const r = answerByTask.get(t.id);
            if (r) response = { rating: r.rating, feedback: r.feedback, photos: [] };
          }
          return { id: t.id, category: t.category, taskType: t.taskType, task: t.task, imageCount: t.imageCount, response };
        }),
      })
    );
  })
);

router.put(
  "/me/assignments/:assignmentId/supervisor-tasks/responses",
  validate({ body: s.supervisorChecklistSave }),
  asyncHandler(async (req, res) => {
    const { activation, today, visitNo } = await loadVisit(req);
    const { responses } = req.body as { responses: { taskId: string; rating?: number | null; feedback?: string | null }[] };

    const taskIds = [...new Set(responses.map((r) => r.taskId))];
    const tasks = await prisma.supervisorTask.findMany({
      where: { id: { in: taskIds }, campaignId: activation.campaignId, deletedAt: null },
    });
    if (tasks.length !== taskIds.length) throw notFound("Supervisor task");
    const typeById = new Map(tasks.map((t) => [t.id, t.taskType]));
    for (const r of responses) {
      const type = typeById.get(r.taskId);
      if (type === "photo") throw validationError("Photo tasks take photos only", "taskId");
      if (r.rating != null && type !== "range") throw validationError("Only range tasks take a rating", "rating");
    }

    await prisma.$transaction(
      responses.map((r) => {
        const feedback = r.feedback === undefined ? undefined : r.feedback?.trim() || null;
        const data = {
          ...(r.rating !== undefined ? { rating: r.rating } : {}),
          ...(feedback !== undefined ? { feedback } : {}),
        };
        return prisma.supervisorTaskResponse.upsert({
          where: answerKey(r.taskId, activation.id, today, visitNo),
          create: {
            taskId: r.taskId, activationId: activation.id, outletId: activation.outletId,
            supervisorStaffId: req.staff!.sub, date: today, visitNo, ...data,
          },
          update: data,
        });
      })
    );
    res.json(ok({ saved: responses.length }));
  })
);

// Photo endpoints: validate the visit and task *before* multer touches the
// disk, so a rejected upload never leaves an orphan file behind.
async function loadPhotoTask(req: Request, _res: Response, next: NextFunction) {
  try {
    const visit = await loadVisit(req);
    const task = await prisma.supervisorTask.findFirst({
      where: { id: req.params.taskId, campaignId: visit.activation.campaignId, deletedAt: null },
    });
    if (!task) throw notFound("Supervisor task");
    if (task.taskType !== "photo") throw validationError("This task does not take photos");
    (req as any).visit = { visit, task };
    next();
  } catch (err) {
    next(err);
  }
}

const currentPhotos = (visit: Visit, taskId: string, supervisorStaffId: string) =>
  prisma.supervisorTaskResponse.findFirst({ where: photoRow(visit, taskId, supervisorStaffId), include: { photos: true } });

router.post(
  "/me/assignments/:assignmentId/supervisor-tasks/:taskId/photos",
  loadPhotoTask,
  (req, res, next) => {
    // Cheap early limit check; the authoritative one runs after the upload.
    const { visit, task } = (req as any).visit;
    currentPhotos(visit, task.id, req.staff!.sub)
      .then((row) => {
        if ((row?.photos.length ?? 0) >= task.imageCount) throw validationError(`This task takes at most ${task.imageCount} photo(s)`);
        visitPhotoUpload.single("image")(req, res, next);
      })
      .catch(next);
  },
  asyncHandler(async (req, res) => {
    const { visit, task } = (req as any).visit as { visit: Visit; task: { id: string; imageCount: number } };
    if (!req.file) throw validationError("image file is required", "image");
    const url = `${PHOTO_URL_PREFIX}${req.file.filename}`;
    const row = await currentPhotos(visit, task.id, req.staff!.sub);
    if ((row?.photos.length ?? 0) >= task.imageCount) {
      removeStoredPhoto(url);
      throw validationError(`This task takes at most ${task.imageCount} photo(s)`);
    }
    const updated = row
      ? await prisma.supervisorTaskResponse.update({
          where: { id: row.id },
          data: { photos: { create: { url } } },
          include: { photos: true },
        })
      : await prisma.supervisorTaskResponse.create({
          data: {
            taskId: task.id, activationId: visit.activation.id, outletId: visit.activation.outletId,
            supervisorStaffId: req.staff!.sub, date: visit.today, visitNo: visit.visitNo, photos: { create: { url } },
          },
          include: { photos: true },
        });
    res.json(ok({ photos: shapePhotos(updated.photos) }));
  })
);

router.delete(
  "/me/assignments/:assignmentId/supervisor-tasks/:taskId/photos",
  loadPhotoTask,
  asyncHandler(async (req, res) => {
    const { visit, task } = (req as any).visit as { visit: Visit; task: { id: string } };
    const url = typeof req.query.url === "string" ? req.query.url : "";
    const row = await currentPhotos(visit, task.id, req.staff!.sub);
    const photo = row?.photos.find((p) => p.url === url);
    if (!row || !photo) throw notFound("Photo");
    await prisma.supervisorTaskPhoto.delete({ where: { id: photo.id } });
    removeStoredPhoto(url);
    res.json(ok({ photos: shapePhotos(row.photos.filter((p) => p.id !== photo.id)) }));
  })
);

export default router;
