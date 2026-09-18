import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import mobileRoutes from "./modules/mobile";
import adminRoutes from "./modules/admin";
import { errorHandler } from "./middleware/errorHandler";
import { installValidationMessages } from "./utils/validationMessages";

// Rewrite Zod's stock validation text into plain, field-named sentences
// before any schema is parsed (issue #4).
installValidationMessages();

export const app = express();

app.use(cors());
app.use(express.json());

// Uploaded product photos (see catalog.routes.ts POST /items/:id/image) —
// served from wherever the process runs (cwd), matching where multer writes them.
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "campaign-buddy-backend", spec: "v3" }));

// Every /v1 and /admin/v1 response is per-caller (Authorization-scoped), but
// nothing here varies the cache key on it — a browser will happily serve one
// user's cached GET back to a different user hitting the same URL later on
// the same origin (e.g. staff switching accounts in the mobile web preview).
// Disable HTTP caching outright rather than try to get Vary right everywhere.
function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  next();
}

app.use("/v1", noStore, mobileRoutes);
app.use("/admin/v1", noStore, adminRoutes);

// Must be registered last — catches every ApiError thrown by asyncHandler-wrapped routes.
app.use(errorHandler);
