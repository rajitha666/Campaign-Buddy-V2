import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareCoverage, scanAdminRoutes, scanSensitiveFields, type Coverage } from "../src/sync/inventory.js";
import { ALWAYS_DROP } from "../src/shape.js";
import { connect } from "./helpers.js";

// Fails when the backend gains, renames or drops an /admin/v1 route without the MCP server
// recording a decision — that is the trigger for the MCP sync agent (see docs/mcp-sync-agent.md).

const backend = fileURLToPath(new URL("../../campaign-buddy-backend", import.meta.url));
const coverage: Coverage = JSON.parse(readFileSync(new URL("../coverage.json", import.meta.url), "utf8"));
const routes = scanAdminRoutes(backend);

const HOWTO =
  "Add it to campaign-buddy-mcp/coverage.json: either { \"tool\": \"<mcp tool name>\" } after adding/updating the tool, " +
  "or { \"excluded\": \"<why an LLM should not have this>\" }. Read-only routes may map to \"api_get\".";

describe("backend ↔ MCP route coverage", () => {
  it("scanner finds the backend routes (guards against the regex silently matching nothing)", () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(routes.some((r) => r.key === "GET /campaigns/:campaignId/reports/outlet-wise")).toBe(true);
  });

  it("every backend admin route has an MCP decision", () => {
    const { unmapped } = compareCoverage(routes, coverage);
    expect(unmapped.map((r) => `${r.key}   (${r.file})`), `New backend route(s) not covered by the MCP server. ${HOWTO}`).toEqual([]);
  });

  it("the manifest has no stale entries for routes that no longer exist", () => {
    expect(compareCoverage(routes, coverage).stale, "Remove these from campaign-buddy-mcp/coverage.json (route renamed or deleted in the backend).").toEqual([]);
  });

  it("every entry is exactly one of tool / excluded, and exclusions give a reason", () => {
    expect(compareCoverage(routes, coverage).malformed).toEqual([]);
    for (const [k, v] of Object.entries(coverage.routes)) {
      if (v.excluded) expect(v.excluded.trim().length, `${k}: give a reason`).toBeGreaterThan(8);
    }
  });

  it("mapped tools exist, and read routes map to read tools while writes map to write tools", async () => {
    const { client } = await connect({});
    const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
    for (const [key, entry] of Object.entries(coverage.routes)) {
      if (!entry.tool) continue;
      const tool = tools.get(entry.tool);
      expect(tool, `${key} → unknown MCP tool "${entry.tool}"`).toBeDefined();
      const isRead = key.startsWith("GET ");
      expect(tool!.annotations?.readOnlyHint === true, `${key} → ${entry.tool}: read/write mismatch`).toBe(isRead);
    }
  });
});

describe("compareCoverage", () => {
  const r = (key: string) => ({ key, method: key.split(" ")[0], path: key.split(" ")[1], file: "x.routes.ts" });

  it("reports new, stale and malformed entries", () => {
    const report = compareCoverage(
      [r("GET /a"), r("POST /new")],
      { routes: { "GET /a": { tool: "t" }, "GET /gone": { tool: "t" }, "POST /both": { tool: "t", excluded: "why not" } } },
    );
    expect(report.unmapped.map((x) => x.key)).toEqual(["POST /new", ]);
    expect(report.stale).toEqual(["GET /gone", "POST /both"]);
    expect(report.malformed).toEqual(["POST /both"]);
  });
});

describe("sensitive columns stay redacted", () => {
  const reviewed = coverage.reviewedFields ?? {};
  const fields = scanSensitiveFields(backend);

  it("scanner finds the schema's sensitive-looking columns", () => {
    expect(fields.some((f) => f.key === "Staff.nic")).toBe(true);
  });

  it("every sensitive-looking column is redacted or explicitly reviewed", () => {
    const unhandled = fields.filter((f) => !ALWAYS_DROP.has(f.field) && !(f.key in reviewed)).map((f) => f.key);
    expect(
      unhandled,
      "New sensitive-looking DB column(s). If they hold personal data, add the field name to ALWAYS_DROP in src/shape.ts (with a test); " +
        "if they are safe business data, add \"Model.field\": \"reason\" to reviewedFields in campaign-buddy-mcp/coverage.json.",
    ).toEqual([]);
  });

  it("reviewedFields has no stale entries", () => {
    const known = new Set(fields.map((f) => f.key));
    expect(Object.keys(reviewed).filter((k) => !known.has(k))).toEqual([]);
  });
});
