import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Deterministic half of the "keep the MCP in step with the backend" loop: list every
// /admin/v1 route the backend defines, so a test (and the sync agent) can tell exactly
// which ones the MCP server has made a decision about. No LLM involved.

export interface BackendRoute {
  key: string; // "GET /campaigns/:campaignId"
  method: string;
  path: string;
  file: string; // e.g. operations.routes.ts
}

const ROUTE = /router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;

/** Admin routes are all mounted flat under /admin/v1 (modules/admin/index.ts uses router.use(x) with no prefix). */
export function scanAdminRoutes(backendDir: string): BackendRoute[] {
  const dir = join(backendDir, "src", "modules", "admin");
  const out: BackendRoute[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".routes.ts")).sort()) {
    const src = readFileSync(join(dir, file), "utf8");
    for (const m of src.matchAll(ROUTE)) {
      const method = m[1].toUpperCase();
      out.push({ key: `${method} ${m[2]}`, method, path: m[2], file });
    }
  }
  return out;
}

export interface CoverageEntry {
  /** MCP tool that serves this route (must exist and match read/write). */
  tool?: string;
  /** Deliberately not exposed — say why, so the decision is reviewable. */
  excluded?: string;
}
export interface Coverage {
  routes: Record<string, CoverageEntry>;
  /** "Model.field" → why this sensitive-looking column is safe to return (business data, or never reachable). */
  reviewedFields?: Record<string, string>;
}

export interface CoverageReport {
  /** Backend routes with no decision yet — the MCP is behind. */
  unmapped: BackendRoute[];
  /** Manifest entries for routes that no longer exist — remove them. */
  stale: string[];
  /** Entries that are neither a tool nor an exclusion, or both. */
  malformed: string[];
}

export function compareCoverage(routes: BackendRoute[], coverage: Coverage): CoverageReport {
  const keys = new Set(routes.map((r) => r.key));
  return {
    unmapped: routes.filter((r) => !(r.key in coverage.routes)),
    stale: Object.keys(coverage.routes).filter((k) => !keys.has(k)),
    malformed: Object.entries(coverage.routes)
      .filter(([, v]) => !!v.tool === !!v.excluded)
      .map(([k]) => k),
  };
}

// ---- Sensitive-column guard -------------------------------------------------------------
// The admin API returns whole Prisma rows, so a new personal-data column on any model would flow
// straight to an LLM unless src/shape.ts redacts it. Every column whose name looks sensitive must
// either be redacted (ALWAYS_DROP) or be listed in coverage.json "reviewedFields" with a reason.

const SENSITIVE_FIELD = /^nic$|bank|birth|address|emergency|passw|token|secret|passport|salary|gender|email|phone|mobile|ssn/i;
const IGNORED_FIELD = /^license|^refreshTokens$/; // relations / unrelated "license" counters that only match by accident

export function scanSensitiveFields(backendDir: string): { model: string; field: string; key: string }[] {
  const src = readFileSync(join(backendDir, "prisma", "schema.prisma"), "utf8");
  const out: { model: string; field: string; key: string }[] = [];
  let model = "";
  for (const line of src.split(/\r?\n/)) {
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) { model = m[1]; continue; }
    if (/^\}/.test(line)) { model = ""; continue; }
    const f = /^\s{2}(\w+)\s+\w/.exec(line);
    if (model && f && SENSITIVE_FIELD.test(f[1]) && !IGNORED_FIELD.test(f[1])) {
      out.push({ model, field: f[1], key: `${model}.${f[1]}` });
    }
  }
  return out;
}
