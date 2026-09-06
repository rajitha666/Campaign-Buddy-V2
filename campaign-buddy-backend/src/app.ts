import express from "express";
import cors from "cors";
import mobileRoutes from "./modules/mobile";
import adminRoutes from "./modules/admin";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "campaign-buddy-backend", spec: "v3" }));

app.use("/v1", mobileRoutes);
app.use("/admin/v1", adminRoutes);

// Must be registered last — catches every ApiError thrown by asyncHandler-wrapped routes.
app.use(errorHandler);
