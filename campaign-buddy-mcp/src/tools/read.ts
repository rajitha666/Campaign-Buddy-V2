import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slim } from "../shape.js";
import { campaignId, dateFrom, dateTo, outletId, paging, readTool, rows, text, ymd, type Ctx } from "./util.js";

/** Business "today" — the platform runs on Sri Lanka time (Asia/Colombo). */
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(now);
}

const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v);
const q = (o: Record<string, unknown>) => o as Record<string, string | number | boolean | undefined>;

// Pull the few fields an analyst needs out of the deeply nested Prisma rows the admin API returns.
const shapeAttendance = (r: any) => ({
  date: day(r.date),
  staffId: r.staffId,
  staffName: r.staff?.fullName,
  staffType: r.staff?.userType,
  outletId: r.activation?.outletId,
  outlet: r.activation?.outlet?.name,
  activation: r.activation?.name,
  status: r.status,
  checkInAt: r.checkInAt,
  checkOutAt: r.checkOutAt,
  checkInLocationVerified: r.checkInLocationVerified,
  salesSummaryConfirmedAtCheckout: r.salesSummaryConfirmedAtCheckout,
});

const shapeSale = (r: any) => {
  const ai = r.activationItem;
  const item = ai?.campaignItem?.item;
  return {
    salesRecordId: r.id,
    date: day(r.date),
    outletId: ai?.activation?.outletId,
    outlet: ai?.activation?.outlet?.name,
    promoter: ai?.activation?.staff?.fullName,
    item: item?.name,
    unitPrice: item?.unitPrice,
    openingStock: r.openingStock,
    soldToday: r.soldToday,
    salesValue: item ? r.soldToday * item.unitPrice : undefined,
    otherInterestedCustomers: r.otherInterestedCustomers,
    reorderFlag: r.reorderFlag,
  };
};

const shapeActivation = (a: any) => ({
  id: a.id,
  name: a.name,
  outletId: a.outletId,
  outlet: a.outlet?.name,
  promoterId: a.staffId,
  promoter: a.staff?.fullName,
  supervisorId: a.supervisorStaffId ?? undefined,
  supervisor: a.supervisor?.fullName,
  dateFrom: day(a.dateFrom),
  dateTo: day(a.dateTo),
  targetType: a.targetType,
  targetCategorization: a.targetCategorization,
  targetUnit: a.targetUnit,
  activationType: a.activationType,
});

const mapEnv = (env: { data: any; meta?: any }, fn: (r: any) => unknown) => ({
  ...env,
  data: Array.isArray(env.data) ? env.data.map(fn) : env.data,
});

export const REPORTS = ["sku-wise", "brand-wise", "outlet-wise", "starting-stock", "sales-status", "reorder", "attendance-monthly"] as const;

const CATALOG = {
  clients: "/clients",
  brands: "/brands",
  items: "/items",
  cities: "/cities",
  outlets: "/outlets",
  "distributor-points": "/distributor-points",
} as const;
type CatalogKind = keyof typeof CATALOG;
const CATALOG_KINDS = Object.keys(CATALOG) as [CatalogKind, ...CatalogKind[]];

export function registerReadTools(server: McpServer, { api }: Ctx) {
  readTool(
    server,
    "whoami",
    {
      title: "Who am I / current context",
      description:
        "Returns the Campaign Buddy user this connection acts as (name, role) and today's business date (Asia/Colombo). " +
        "Roles: adm = super admin (everything), usr = office admin (read+write on granted campaigns), supervisor/sponsor = read-only on granted campaigns. " +
        "Call this first when you need to know what you are allowed to do or what 'today' means.",
      input: {},
    },
    async () => {
      const user = await api.whoami();
      return text({ user, today: today(), timezone: "Asia/Colombo", currency: "LKR" });
    },
  );

  readTool(
    server,
    "list_campaigns",
    {
      title: "List campaigns",
      description: "Lists the campaigns this user can access, with client, dates and status (upcoming | active | ended).",
      input: { status: z.enum(["upcoming", "active", "ended"]).optional().describe("Filter by status") },
    },
    async ({ status }) => {
      const env = await api.get("/campaigns");
      const list = (env.data as any[])
        .filter((c) => !status || c.status === status)
        .map((c) => ({
          id: c.id,
          campaignNo: c.campaignNo,
          name: c.name,
          client: c.client?.clientName,
          status: c.status,
          startDate: day(c.startDate),
          endDate: day(c.endDate),
          promoterLabel: c.promoterLabel,
        }));
      return rows({ data: list });
    },
  );

  readTool(
    server,
    "get_campaign",
    {
      title: "Get campaign details",
      description: "One campaign's settings plus the product items (SKUs) assigned to it, with unit prices.",
      input: { campaignId },
    },
    async ({ campaignId }) => {
      const [c, items] = await Promise.all([api.get(`/campaigns/${campaignId}`), api.get(`/campaigns/${campaignId}/items`)]);
      return text({ campaign: slim(c.data), items: slim(items.data) });
    },
  );

  readTool(
    server,
    "campaign_overview",
    {
      title: "Campaign snapshot for a day",
      description:
        "The best first call for 'how is campaign X doing?'. In one shot: campaign info, per-outlet foot fall / approached / converted / sales / target " +
        "achievement for the date range (defaults to today), promoters absent today, and who is checked in on the field right now. " +
        "Then drill down with get_report, get_sales_records, get_attendance, etc.",
      input: { campaignId, dateFrom, dateTo, date: ymd.optional().describe("Day used for the absence check (default today)") },
    },
    async ({ campaignId, dateFrom: from, dateTo: to, date }) => {
      const d = date ?? today();
      const range = { dateFrom: from ?? d, dateTo: to ?? d };
      const [camp, outlets, absent, live] = await Promise.allSettled([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/reports/outlet-wise`, range),
        api.get(`/campaigns/${campaignId}/absence`, { date: d, pageSize: 200 }),
        api.get(`/campaigns/${campaignId}/tracking/live`),
      ]);
      const part = (r: PromiseSettledResult<{ data: unknown }>) =>
        r.status === "fulfilled" ? slim(r.value.data) : { error: (r.reason as Error).message };
      return text({
        range,
        campaign: part(camp),
        outlets: part(outlets),
        outletsGrandTotal: outlets.status === "fulfilled" ? outlets.value.meta?.grandTotal : undefined,
        absentToday:
          absent.status === "fulfilled"
            ? { date: d, total: absent.value.meta?.total, staff: slim(absent.value.data) }
            : { date: d, error: (absent.reason as Error).message },
        checkedInNow: part(live),
      });
    },
  );

  readTool(
    server,
    "get_report",
    {
      title: "Campaign reports",
      description:
        "Aggregated, computed reports (a sponsor sees the same data, auto-filtered to their outlets).\n" +
        "- sku-wise: units + LKR value per product\n" +
        "- brand-wise: per outlet x brand\n" +
        "- outlet-wise: foot fall, approached, converted, sales, target achievement, custom fields per outlet\n" +
        "- starting-stock: per day, outlet, promoter and product, the stock the promoter started the day with (first stock update after check-in)\n" +
        "- sales-status: live per-activation sales status for `date`\n" +
        "- reorder: items flagged for restock on `date`\n" +
        "- attendance-monthly: per-person day grid for `month`.\n" +
        "Sales value = units sold x item unit price (LKR).",
      input: {
        campaignId,
        report: z.enum(REPORTS),
        dateFrom,
        dateTo,
        outletId,
        date: ymd.optional().describe("sales-status / reorder only (default today)"),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("attendance-monthly only, YYYY-MM (default this month)"),
        brandId: z.string().optional().describe("reorder only"),
      },
    },
    async ({ campaignId, report, dateFrom, dateTo, outletId, date, month, brandId }) =>
      rows(await api.get(`/campaigns/${campaignId}/reports/${report}`, q({ dateFrom, dateTo, outletId, date, month, brandId }))),
  );

  readTool(
    server,
    "get_sales_records",
    {
      title: "Raw sales records",
      description:
        "Per-day, per-item sales rows (opening stock, units sold, interested customers, reorder flag) with outlet and promoter. " +
        "Use get_report for totals; use this to find a specific record (its salesRecordId is needed by correct_sales_record).",
      input: { campaignId, dateFrom, dateTo, outletId, ...paging },
    },
    async ({ campaignId, ...f }) => rows(mapEnv(await api.get(`/campaigns/${campaignId}/sales`, q(f)), shapeSale)),
  );

  readTool(
    server,
    "get_daily_stats",
    {
      title: "Foot fall / approach / conversion",
      description: "Daily engagement funnel: foot fall, approached, converted, per outlet per day, with totals. Conversion rate = converted / approached.",
      input: { campaignId, dateFrom, dateTo, outletId },
    },
    async ({ campaignId, ...f }) => {
      const env = await api.get(`/campaigns/${campaignId}/stats`, q(f));
      const d = slim(env.data) as any;
      const byDay = (d.byDay ?? []).map((r: any) => ({
        date: day(r.date),
        outletId: r.outletId,
        outlet: r.outletName,
        promoter: r.staffName,
        footFall: r.footFall,
        approached: r.approached,
        converted: r.converted,
      }));
      return text({ totals: d.totals, count: byDay.length, byDay });
    },
  );

  readTool(
    server,
    "get_attendance",
    {
      title: "Attendance records",
      description:
        "Check-in / check-out records (newest first) for promoters and supervisors. " +
        "checkInLocationVerified=false means the check-in was outside the outlet geofence (a soft flag; it never blocks check-in).",
      input: {
        campaignId,
        dateFrom,
        dateTo,
        outletId,
        role: z.enum(["promoter", "supervisor"]).optional().describe("Role of the person who checked in"),
        ...paging,
      },
    },
    async ({ campaignId, ...f }) => rows(mapEnv(await api.get(`/campaigns/${campaignId}/attendance`, q(f)), shapeAttendance)),
  );

  readTool(
    server,
    "get_absence",
    {
      title: "Absent promoters for a day",
      description: "Promoters whose activation covers `date` but who have not checked in and are not on approved leave.",
      input: { campaignId, date: ymd.describe("Day to check, YYYY-MM-DD"), outletId, ...paging },
    },
    async ({ campaignId, ...f }) => rows(await api.get(`/campaigns/${campaignId}/absence`, q(f))),
  );

  readTool(
    server,
    "get_outlet_attendance",
    {
      title: "Supervisor outlet visits",
      description: "The supervisor visit log: attendance rows created by supervisors visiting outlets.",
      input: { campaignId, dateFrom, dateTo, outletId, ...paging },
    },
    async ({ campaignId, ...f }) => rows(await api.get(`/campaigns/${campaignId}/outlet-attendance`, q(f))),
  );

  readTool(
    server,
    "get_live_tracking",
    {
      title: "Live field positions",
      description: "Everyone currently checked in (open shift) with their last GPS ping (coordinates + timestamp).",
      input: { campaignId },
    },
    async ({ campaignId }) => rows(await api.get(`/campaigns/${campaignId}/tracking/live`)),
  );

  readTool(
    server,
    "list_activations",
    {
      title: "List activations",
      description: "Activations = a promoter assigned to an outlet for a date range (with optional covering supervisor and target setup).",
      input: { campaignId },
    },
    async ({ campaignId }) => rows(mapEnv(await api.get(`/campaigns/${campaignId}/activations`), shapeActivation)),
  );

  readTool(
    server,
    "get_activation",
    {
      title: "Activation with targets",
      description: "One activation with its assigned items and sales targets including progress (achieved vs target, achievementPct).",
      input: { campaignId, activationId: z.string().min(1) },
    },
    async ({ campaignId, activationId }) => {
      const base = `/campaigns/${campaignId}/activations/${activationId}`;
      const [a, items, targets] = await Promise.all([api.get(base), api.get(`${base}/items`), api.get(`${base}/targets`)]);
      return text({ activation: slim(a.data), items: slim(items.data), targets: slim(targets.data) });
    },
  );

  readTool(
    server,
    "list_leave_requests",
    {
      title: "Leave requests",
      description: "Leave requests from staff on this campaign. status: pending | approved | declined. Decide with decide_leave_request.",
      input: { campaignId, status: z.enum(["pending", "approved", "declined"]).optional(), ...paging },
    },
    async ({ campaignId, status, ...p }) => {
      const env = await api.get(`/campaigns/${campaignId}/leave-requests`, q(p));
      const data = (env.data as any[])
        .filter((r) => !status || r.status === status)
        .map((r) => ({
          id: r.id,
          staffId: r.staffId,
          staff: r.staff?.fullName,
          fromDate: day(r.fromDate),
          toDate: day(r.toDate),
          reason: r.reason,
          note: r.note,
          status: r.status,
          decidedAt: r.decidedAt,
        }));
      return rows({ data, meta: env.meta });
    },
  );

  readTool(
    server,
    "list_staff",
    {
      title: "Search staff",
      description: "Active promoters and supervisors (names, employee ids, city). HR and banking fields are never returned.",
      input: { search: z.string().optional().describe("Name contains..."), userType: z.enum(["promoter", "supervisor"]).optional(), ...paging },
    },
    async (f) => rows(await api.get("/staff", q(f))),
  );

  readTool(
    server,
    "get_staff_evaluation",
    {
      title: "Staff performance evaluation",
      description:
        "A promoter's or supervisor's attendance, sales, conversion and supervisor QA ratings over a window (defaults to all time). Good for performance reviews and coaching.",
      input: { staffId: z.string().min(1), dateFrom, dateTo },
    },
    async ({ staffId, ...f }) => rows(await api.get(`/staff/${staffId}/evaluation`, q(f))),
  );

  readTool(
    server,
    "lookup_catalog",
    {
      title: "Look up master data",
      description: "Find ids for master data: clients, brands, items (SKUs), cities, outlets, distributor-points. `search` filters by name where supported.",
      input: { kind: z.enum(CATALOG_KINDS), search: z.string().optional(), ...paging },
    },
    async ({ kind, ...f }) => rows(await api.get(CATALOG[kind], q(f))),
  );

  readTool(
    server,
    "get_supervisor_checklist_results",
    {
      title: "Supervisor outlet checklist results",
      description:
        "Supervisors' outlet-visit QA: per-task ratings (1-5), feedback and photos. " +
        "With summary=true returns averages per promoter / outlet / category and incomplete visits instead.",
      input: { campaignId, dateFrom, dateTo, outletId, summary: z.boolean().optional(), ...paging },
    },
    async ({ campaignId, summary, ...f }) =>
      rows(await api.get(`/campaigns/${campaignId}/supervisor-task-${summary ? "summary" : "responses"}`, q(f))),
  );

  readTool(
    server,
    "get_license_usage",
    {
      title: "License / seat usage",
      description: "Per-campaign licensed-seat metering vs caps (state: ok | warn | at | over). Admin roles only. Omit campaignId for the account-wide rollup.",
      input: {
        campaignId: campaignId.optional(),
        state: z.enum(["ok", "warn", "at", "over"]).optional().describe("Account-wide only: minimum severity"),
      },
    },
    async ({ campaignId, state }) =>
      rows(campaignId ? await api.get(`/campaigns/${campaignId}/license`) : await api.get("/license/usage", q({ state }))),
  );

  readTool(
    server,
    "api_get",
    {
      title: "Raw GET escape hatch",
      description:
        "Read-only GET against any Campaign Buddy admin API path not covered by a dedicated tool (paths are relative to /admin/v1, e.g. /campaigns/{id}/supervisor-routes). " +
        "Same permissions and redaction as every other tool. Prefer the dedicated tools; use this only to reach an endpoint they don't expose.",
      input: {
        path: z.string().startsWith("/").describe("e.g. /campaigns/{id}/supervisor-routes"),
        query: z.record(z.string(), z.string()).optional(),
      },
    },
    async ({ path, query }) => {
      // GET only, and never the auth or user-admin surface — a model has no reason to enumerate logins.
      if (path.includes("..") || /^\/(auth|users|roles)(\/|\?|$)/.test(path)) {
        throw new Error("That path is not readable through api_get.");
      }
      return rows(await api.get(path, query));
    },
  );
}
