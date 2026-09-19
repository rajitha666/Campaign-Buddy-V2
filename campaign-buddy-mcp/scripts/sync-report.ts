// Prints how far the MCP server has drifted from the backend, as JSON. Used by the sync agent
// workflow to decide whether there is anything to do, and as its starting brief.
//   npx tsx scripts/sync-report.ts [--since <git-ref>]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { compareCoverage, scanAdminRoutes, type Coverage } from "../src/sync/inventory.js";

const backend = new URL("../../campaign-buddy-backend", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const coverage: Coverage = JSON.parse(readFileSync(new URL("../coverage.json", import.meta.url), "utf8"));
const report = compareCoverage(scanAdminRoutes(backend), coverage);

// Backend files whose changes can affect what the MCP returns or accepts.
const RELEVANT = [
  "campaign-buddy-backend/src/modules/admin/",
  "campaign-buddy-backend/src/modules/mobile/", // mobile writes change the data admin reads surface
  "campaign-buddy-backend/src/schemas.ts",
  "campaign-buddy-backend/src/utils/",
  "campaign-buddy-backend/src/middleware/",
  "campaign-buddy-backend/prisma/schema.prisma",
  "campaign-buddy-backend/prisma/migrations/",
];

const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx > -1 ? process.argv[sinceIdx + 1] : undefined;
let changedBackendFiles: string[] = [];
if (since) {
  const out = execFileSync("git", ["diff", "--name-only", `${since}..HEAD`, "--", ...RELEVANT.map((p) => `:(top)${p}`)], { encoding: "utf8" });
  changedBackendFiles = out.split("\n").filter(Boolean);
}

const drift = report.unmapped.length + report.stale.length + report.malformed.length;
console.log(JSON.stringify({ since: since ?? null, drift, changedBackendFiles, ...report }, null, 2));
