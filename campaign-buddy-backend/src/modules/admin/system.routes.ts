import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { githubActionsConfigured, latestCiRun } from "../../utils/githubActions";
import backendPkg from "../../../package.json";

// Portal "System Status" page: backend build version + the latest CI run's
// per-job pass/fail, read live from GitHub Actions. Super Admin only — this
// is platform build/ops info (repo, CI internals), not something a
// customer's own Campaign Admin needs. Same gate as /users, /roles
// (rbac.routes.ts): nav.js can't filter below the "admin" persona, so a
// Campaign Admin still sees the link and gets a 403 if they click it —
// accepted existing pattern here, not new.
const router = Router();

router.get(
  "/system/status",
  requireRole("adm"),
  asyncHandler(async (_req, res) => {
    const configured = githubActionsConfigured();
    let run = null;
    let error: string | null = null;
    if (configured) {
      try {
        run = await latestCiRun();
      } catch (e) {
        error = (e as Error).message;
      }
    }

    res.json(
      ok({
        backendVersion: backendPkg.version,
        ci: { configured, error, run },
      })
    );
  })
);

export default router;
