import "dotenv/config";
import { app } from "./app";
import { startLicenseSnapshotJob } from "./jobs/licenseSnapshot";
import { startIssueSyncJob } from "./jobs/issueSync";
import { startAutoCheckoutJob } from "./jobs/autoCheckout";
import { assertTenantSlugEnv } from "./utils/meta";

// Fail before accepting traffic rather than serve a broken tenant identity:
// TENANT_SLUG feeds the JWT audience and the app's per-tenant storage
// namespace, so a typo is a cross-tenant data risk. Unset is fine (dev,
// single-tenant). See docs/multi-tenant-release-strategy.md section 2.
assertTenantSlugEnv();

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Campaign Buddy backend (Spec v3) listening on port ${port}`);
  startLicenseSnapshotJob();
  startIssueSyncJob();
  startAutoCheckoutJob();
});
