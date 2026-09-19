// Live smoke test: spawns the real stdio MCP server against a running backend and
// exercises every read tool, then a write preview. Credentials come from env
// (CB_API_BASE_URL / CB_USERNAME / CB_PASSWORD) — nothing is stored in the repo.
//   CB_USERNAME=... CB_PASSWORD=... npm run smoke
import { connectMcp } from "../src/client/connect.js";

const PII = /\b(nic|bankAccountNumber|bankName|dateOfBirth|permanentAddress|emergencyContact\w*|passwordHash|mobileUsername)\b/;

const mcp = await connectMcp({ kind: "stdio", env: {} });
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const t0 = Date.now();
  const res: any = await mcp.callTool({ name, arguments: args });
  const text: string = res.content?.[0]?.text ?? "";
  let json: any;
  try { json = JSON.parse(text); } catch { /* plain text error */ }
  const ok = !res.isError;
  const size = json?.rows?.length ?? json?.count ?? (Array.isArray(json?.data) ? json.data.length : undefined);
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(30)} ${String(text.length).padStart(6)}ch ${Date.now() - t0}ms${size !== undefined ? ` rows=${size}` : ""}${ok ? "" : `  ${text.slice(0, 140)}`}`);
  if (PII.test(text)) { console.log(`  !! PII key leaked in ${name}`); process.exitCode = 1; }
  return { ok, json, text };
};

const tools = (await mcp.listTools()).tools;
console.log(`${tools.length} tools (${tools.filter((t) => t.annotations?.readOnlyHint === false).length} write)\n`);

const who = await call("whoami");
console.log(`  as ${who.json.user.displayName} (${who.json.user.roleId}), today ${who.json.today}`);
const camps = await call("list_campaigns");
const c = camps.json?.rows?.find((r: any) => r.name.includes(process.env.SMOKE_CAMPAIGN ?? "Radiance")) ?? camps.json?.rows?.[0];
if (!c) { console.log("no campaigns visible"); await mcp.close(); process.exit(); }
console.log(`  campaign: ${c.name} [${c.status}] ${c.startDate} → ${c.endDate}`);

const cid = c.id;
const range = { dateFrom: c.startDate, dateTo: c.endDate };
await call("get_campaign", { campaignId: cid });
const ov = await call("campaign_overview", { campaignId: cid, ...range });
for (const report of ["sku-wise", "brand-wise", "outlet-wise", "sales-status", "reorder", "attendance-monthly"]) {
  await call("get_report", { campaignId: cid, report, ...range });
}
const sales = await call("get_sales_records", { campaignId: cid, pageSize: 3 });
await call("get_daily_stats", { campaignId: cid, ...range });
await call("get_attendance", { campaignId: cid, pageSize: 3 });
await call("get_absence", { campaignId: cid, date: c.endDate });
await call("get_outlet_attendance", { campaignId: cid, pageSize: 3 });
await call("get_live_tracking", { campaignId: cid });
const acts = await call("list_activations", { campaignId: cid });
if (acts.json?.rows?.[0]) await call("get_activation", { campaignId: cid, activationId: acts.json.rows[0].id });
const leave = await call("list_leave_requests", { campaignId: cid });
const staff = await call("list_staff", { userType: "promoter", pageSize: 3 });
if (staff.json?.rows?.[0]) await call("get_staff_evaluation", { staffId: staff.json.rows[0].id });
for (const kind of ["clients", "brands", "items", "cities", "outlets", "distributor-points"]) await call("lookup_catalog", { kind });
await call("get_supervisor_checklist_results", { campaignId: cid, pageSize: 3 });
await call("get_supervisor_checklist_results", { campaignId: cid, summary: true });
await call("get_license_usage", { campaignId: cid });
await call("get_license_usage");
await call("api_get", { path: `/campaigns/${cid}/supervisor-routes` });

console.log("\nfirst sales row:", JSON.stringify(sales.json?.rows?.[0]));
console.log("overview keys:", ov.json ? Object.keys(ov.json).join(",") : "n/a");
console.log("outlet sample:", JSON.stringify(ov.json?.outlets?.[0] ?? ov.json?.outlets)?.slice(0, 300));

// Write path: preview only — never confirmed here.
const pending = leave.json?.rows?.find((r: any) => r.status === "pending");
if (pending) {
  const p = await call("decide_leave_request", { campaignId: cid, leaveRequestId: pending.id, status: "approved" });
  console.log("write preview status:", p.json?.status ?? p.text.slice(0, 120));
}
await mcp.close();
