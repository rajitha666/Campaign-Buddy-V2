import express from "express";
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

app.use("/v1", mobileRoutes);
app.use("/admin/v1", adminRoutes);

// Must be registered last — catches every ApiError thrown by asyncHandler-wrapped routes.
app.use(errorHandler);
