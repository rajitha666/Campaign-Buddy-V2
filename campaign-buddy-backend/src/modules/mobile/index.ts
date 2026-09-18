import { Router } from "express";
import { staffAuth } from "../../middleware/staffAuth";
import authRoutes from "./auth.routes";
import meRoutes from "./me.routes";
import attendanceRoutes from "./attendance.routes";
import locationRoutes from "./location.routes";
import statsRoutes from "./stats.routes";
import productsRoutes from "./products.routes";
import salesSummaryRoutes from "./salesSummary.routes";
import salesFieldsRoutes from "./salesFields.routes";
import timeOffRoutes from "./timeOff.routes";
import performanceRoutes from "./performance.routes";
import supervisorChecklistRoutes from "./supervisorChecklist.routes";

// Mobile app — /v1/*. Auth + health routes are public; everything else requires staffAuth.
const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok", service: "campaign-buddy-backend", spec: "v3" }));

router.use(authRoutes); // /auth/login, /auth/refresh, /auth/forgot-password, /auth/logout (logout itself gated inline)

router.use(staffAuth);
router.use(meRoutes);
router.use(attendanceRoutes);
router.use(locationRoutes);
router.use(statsRoutes);
router.use(productsRoutes);
router.use(salesSummaryRoutes);
router.use(salesFieldsRoutes);
router.use(timeOffRoutes);
router.use(performanceRoutes);
router.use(supervisorChecklistRoutes);

export default router;
