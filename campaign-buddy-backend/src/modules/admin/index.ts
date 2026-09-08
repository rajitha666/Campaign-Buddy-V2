import { Router } from "express";
import { userAuth } from "../../middleware/userAuth";
import authRoutes from "./auth.routes";
import catalogRoutes from "./catalog.routes";
import staffRoutes from "./staff.routes";
import campaignsRoutes from "./campaigns.routes";
import activationsRoutes from "./activations.routes";
import operationsRoutes from "./operations.routes";
import reportsRoutes from "./reports.routes";
import rbacRoutes from "./rbac.routes";
import salesFieldsRoutes from "./salesFields.routes";

// Admin/Supervisor/Sponsor portal — /admin/v1/*. One API, three personas —
// role + CampaignAccessGrant decide what each caller can see/do (Spec v3 intro).
const router = Router();

router.use(authRoutes); // /auth/login is public; /auth/logout gated inline via userAuth

router.use(userAuth); // everything below requires a valid User token
router.use(catalogRoutes);
router.use(staffRoutes);
router.use(campaignsRoutes);      // includes GET /campaigns (no :campaignId prefix)
router.use(activationsRoutes);    // nested under /campaigns/:campaignId/*, requireCampaignAccess applied per-route
router.use(operationsRoutes);     // same
router.use(salesFieldsRoutes);    // /campaigns/:campaignId/sales-fields — custom sales fields (#13)
router.use(reportsRoutes);        // same
router.use(rbacRoutes);           // /users, /roles — [adm] only, enforced inside the file

export default router;
