import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CampaignBuddyApi } from "./api.js";
import { ConfirmationStore } from "./confirm.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import type { Ctx } from "./tools/util.js";

export const SERVER_INSTRUCTIONS = `Campaign Buddy is a field-marketing execution platform (Sri Lanka; LKR; Asia/Colombo). \
Promoters staff outlets on 'activations' for a campaign; supervisors audit them. You are connected as one portal user whose role and campaign grants \
limit what you can see and do — a 403 means you are not permitted, do not try to work around it.
Start with whoami and list_campaigns; use campaign_overview for a status question and get_report for totals. Read the campaignbuddy://glossary resource for definitions.
Always quote numbers exactly as returned and name the date range they cover. Never invent ids. \
Write tools are two-step: the first call only previews; execute only after the user explicitly approves the preview.`;

export const GLOSSARY = `# Campaign Buddy glossary

**Entities** — Client owns Brands → Items (SKUs, with unitPrice in LKR). A Campaign (campaignNo, dates, status) runs Items at Outlets.
An **Activation** = one promoter assigned to one outlet for a date range (optional covering supervisor, optional item/brand targets).
Staff are promoters (field reps, use the mobile app) or supervisors (audit outlet visits). Portal Users have a role.

**Roles** — adm: everything. usr: office admin, read+write on campaigns they are granted. supervisor / sponsor: read-only, limited to granted campaigns and (optionally) a subset of outlets.
A sponsor (client-side viewer) sees the same reports as admins, auto-filtered to their outlets.

**Metrics** — Foot fall = people who passed the stand. Approached = people the promoter engaged. Converted = people who bought.
Conversion rate = converted / approached (not / foot fall). Sales value = units sold x item unitPrice (LKR). Target achievement % = achieved / target x 100.
reorderFlag = the promoter flagged stock as needing restock that day. otherInterestedCustomers = interested but did not buy.

**Attendance** — status per person per day. Geofence is a SOFT flag: checkInLocationVerified=false marks a check-in outside the outlet radius but never blocks it.
A person can have only one open shift at a time. Absence = an activation covers the day but the promoter has no check-in and no approved leave.
Supervisors have their own attendance rows (outlet visits), separate from the promoter's.

**Supervisor checklist** — per outlet visit, supervisors answer tasks: range (rating 1-5), feedback (text), photo. Averages are computed over range tasks only.

**Campaign status** — upcoming | active | ended, derived from dates unless manually overridden.

**Privacy** — HR and banking fields (NIC, bank details, addresses, date of birth) are removed before data reaches you. Do not ask for them.`;

const promptText = (t: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: t } }] });

export function buildServer(api: CampaignBuddyApi, opts: { readOnly?: boolean; confirmations?: ConfirmationStore } = {}): McpServer {
  const server = new McpServer(
    { name: "campaign-buddy", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const ctx: Ctx = { api, readOnly: !!opts.readOnly, confirmations: opts.confirmations ?? new ConfirmationStore() };

  registerReadTools(server, ctx);
  if (!ctx.readOnly) registerWriteTools(server, ctx);

  server.registerResource(
    "glossary",
    "campaignbuddy://glossary",
    { title: "Campaign Buddy glossary & business rules", description: "Definitions of entities, roles, metrics and rules. Read before analysing data.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GLOSSARY }] }),
  );

  server.registerPrompt(
    "daily_briefing",
    {
      title: "Daily field briefing",
      description: "Morning/evening operations brief for a campaign: sales, engagement, attendance exceptions, stock flags.",
      argsSchema: { campaignId: z.string().describe("Campaign id"), date: z.string().optional().describe("YYYY-MM-DD, default today") },
    },
    ({ campaignId, date }) =>
      promptText(
        `Prepare a daily field briefing for campaign ${campaignId}${date ? ` for ${date}` : " for today"}. ` +
          "Use campaign_overview first, then drill into get_report (reorder, sales-status) and get_absence as needed. " +
          "Structure: 1) headline numbers (sales LKR, foot fall, conversion) 2) best and worst outlets 3) attendance problems (absent, geofence-unverified check-ins, pending leave) " +
          "4) stock/reorder flags 5) three concrete actions for today. Quote figures exactly and state the date range.",
      ),
  );

  server.registerPrompt(
    "weekly_performance_review",
    {
      title: "Weekly performance review",
      description: "Trend analysis over a date range with promoter and outlet rankings and recommendations.",
      argsSchema: { campaignId: z.string(), dateFrom: z.string().describe("YYYY-MM-DD"), dateTo: z.string().describe("YYYY-MM-DD") },
    },
    ({ campaignId, dateFrom, dateTo }) =>
      promptText(
        `Review performance for campaign ${campaignId} from ${dateFrom} to ${dateTo}. Pull get_report (outlet-wise, sku-wise, brand-wise), get_daily_stats and get_attendance. ` +
          "Identify: top/bottom outlets and SKUs, conversion-rate outliers, target achievement vs plan, days with unusual drops, and promoters worth coaching (use get_staff_evaluation for the outliers only). " +
          "End with prioritised recommendations, each tied to a number you retrieved.",
      ),
  );

  server.registerPrompt(
    "attendance_exceptions",
    {
      title: "Attendance exceptions",
      description: "Who is absent, late, unverified or awaiting a leave decision — with proposed actions (no changes made).",
      argsSchema: { campaignId: z.string(), date: z.string().describe("YYYY-MM-DD") },
    },
    ({ campaignId, date }) =>
      promptText(
        `List attendance exceptions for campaign ${campaignId} on ${date}: absent promoters (get_absence), check-ins with checkInLocationVerified=false (get_attendance), ` +
          "shifts still open, and pending leave requests. Propose actions per person. Do not change anything; if a leave decision is warranted, describe it and ask me first.",
      ),
  );

  return server;
}
