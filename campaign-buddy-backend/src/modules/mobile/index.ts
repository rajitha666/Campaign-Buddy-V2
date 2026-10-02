import { Router } from "express";
import { staffAuth } from "../../middleware/staffAuth";
import { ok } from "../../utils/apiResponse";
import { buildMeta } from "../../utils/meta";
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

// Mobile app — /v1/*. Auth, health and meta routes are public; everything else requires staffAuth.
const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok", service: "campaign-buddy-backend", spec: "v3" }));

// The app↔API handshake — tenant identity, contract revision, app version floor
// and the capability list the app branches on. Public: the app reads it before
// it has a token, to decide whether this build can talk to this server at all.
// See docs/multi-tenant-release-strategy.md § 3.2.
router.get("/meta", (_req, res) => res.json(ok(buildMeta())));

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
