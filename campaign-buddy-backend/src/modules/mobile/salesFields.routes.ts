import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { currentActivationForStaff, mobileToday } from "../../utils/currentActivation";
import { activeDefsForCampaign, dayValueMap, productValueMap, serializeWithValues } from "../../utils/salesFieldStore";
import { serializeDefinition } from "../../utils/salesFields";

const router = Router();

// GET /v1/sales-fields — the custom fields configured for the promoter's current
// campaign, split by scope, with today's values filled in (issue #13). Returns
// empty lists when there's no assignment today rather than erroring, so the
// screens can render without a guard.
router.get(
  "/sales-fields",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationForStaff(req.staff!.sub);
    if (!activation) {
      res.json(ok({ day: [], product: [] }));
      return;
    }
    const today = mobileToday();
    const defs = await activeDefsForCampaign(activation.campaignId);
    const dayDefs = defs.filter((d) => d.scope === "day");
    const productDefs = defs.filter((d) => d.scope === "product");

    const dayVals = await dayValueMap(activation.id, today);

    // product-scope values are per activation-item; the mobile screens ask for
    // them per product, so here just return the definitions (no value).
    res.json(ok({
      day: serializeWithValues(dayDefs, dayVals),
      product: productDefs.map((d) => serializeDefinition(d)),
    }));
  })
);

export default router;
