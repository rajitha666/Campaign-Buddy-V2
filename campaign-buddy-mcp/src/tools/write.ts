import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { slim } from "../shape.js";
import { campaignId, fail, text, ymd, type Ctx } from "./util.js";

// Only things a human operator would do in CB Office. Deliberately absent: deletes,
// user/role/access management, license caps, staff creation. The backend still
// enforces role + campaign access on every call (supervisor / sponsor tokens 403).

interface WriteDef<S extends z.ZodRawShape> {
  title: string;
  description: string;
  input: S;
  /** One plain-English sentence describing what will happen — shown to the human approving it. */
  effect: (a: z.infer<z.ZodObject<S>>) => string;
  request: (a: z.infer<z.ZodObject<S>>) => { method: "POST" | "PATCH" | "PUT"; path: string; body?: unknown };
  /** Optional: fetch current values so the approver sees before -> after. */
  before?: (a: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<unknown>;
}

function writeTool<S extends z.ZodRawShape>(server: McpServer, ctx: Ctx, name: string, def: WriteDef<S>) {
  const inputSchema = {
    ...def.input,
    confirmationToken: z
      .string()
      .optional()
      .describe("Leave empty on the first call to get a preview. To execute, call again with the SAME arguments plus the token from the preview — but only after the user has approved the preview."),
  };

  server.registerTool(
    name,
    {
      title: def.title,
      description:
        `${def.description}\n\nTWO-STEP: the first call changes nothing and returns a preview + confirmationToken. ` +
        "Show the preview to the user; only if they approve, call again with identical arguments and the token.",
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (async (raw: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const { confirmationToken, ...args } = raw;
        const a = args as z.infer<z.ZodObject<S>>;
        const req = def.request(a);

        if (!confirmationToken) {
          const issued = ctx.confirmations.issue(name, args);
          let current: unknown;
          try { current = await def.before?.(a, ctx); } catch { /* preview is best-effort */ }
          return text({
            status: "confirmation_required",
            action: name,
            effect: def.effect(a),
            request: { method: req.method, path: `/admin/v1${req.path}`, body: req.body },
            ...(current !== undefined ? { currentValues: slim(current) } : {}),
            confirmationToken: issued.token,
            expiresInSeconds: issued.expiresInSeconds,
            next: "Nothing has been changed yet. Ask the user to approve, then call again with the same arguments and confirmationToken.",
          });
        }

        if (!ctx.confirmations.consume(String(confirmationToken), name, args)) {
          return {
            isError: true,
            content: [{ type: "text", text: "Confirmation token is invalid, expired, already used, or the arguments changed since the preview. Call again without a token to get a fresh preview." }],
          };
        }
        const env = await ctx.api.request(req.method, req.path, { body: req.body });
        return text({ status: "done", action: name, effect: def.effect(a), result: slim(env.data) });
      } catch (e) {
        return fail(e);
      }
    }) as any,
  );
}

const id = (what: string) => z.string().min(1).describe(what);
const minutes = z.number().int().min(0).max(1439);

export function registerWriteTools(server: McpServer, ctx: Ctx) {
  writeTool(server, ctx, "update_campaign", {
    title: "Update campaign",
    description:
      "Change a campaign's name, description, dates or status. Setting `status` is a manual override that sticks until the dates change " +
      "(otherwise status follows the dates). Requires an adm/usr user.",
    input: {
      campaignId,
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      startDate: ymd.optional(),
      endDate: ymd.optional(),
      status: z.enum(["upcoming", "active", "ended"]).optional(),
    },
    effect: ({ campaignId, ...f }) => `Update campaign ${campaignId}: ${JSON.stringify(f)}`,
    request: ({ campaignId, ...body }) => ({ method: "PATCH", path: `/campaigns/${campaignId}`, body }),
    before: async ({ campaignId }, { api }) => (await api.get(`/campaigns/${campaignId}`)).data,
  });

  writeTool(server, ctx, "decide_leave_request", {
    title: "Approve or decline leave",
    description: "Approve or decline a staff leave request (find ids with list_leave_requests status=pending). Requires an adm/usr user.",
    input: { campaignId, leaveRequestId: id("Leave request id"), status: z.enum(["approved", "declined"]) },
    effect: ({ leaveRequestId, status }) => `Mark leave request ${leaveRequestId} as ${status}`,
    request: ({ campaignId, leaveRequestId, status }) => ({ method: "PATCH", path: `/campaigns/${campaignId}/leave-requests/${leaveRequestId}`, body: { status } }),
  });

  writeTool(server, ctx, "correct_sales_record", {
    title: "Correct a sales record",
    description:
      "Fix a day's sales row after the fact (units sold, opening stock, interested customers, reorder flag). soldToday may not exceed openingStock. " +
      "Get salesRecordId from get_sales_records. Requires an adm/usr user.",
    input: {
      campaignId,
      salesRecordId: id("Sales record id"),
      soldToday: z.number().int().min(0).optional(),
      openingStock: z.number().int().min(0).optional(),
      otherInterestedCustomers: z.number().int().min(0).optional(),
      reorderFlag: z.boolean().optional(),
    },
    effect: ({ salesRecordId, campaignId: _c, ...f }) => `Correct sales record ${salesRecordId}: ${JSON.stringify(f)}`,
    request: ({ campaignId, salesRecordId, ...body }) => ({ method: "PATCH", path: `/campaigns/${campaignId}/sales/${salesRecordId}`, body }),
  });

  writeTool(server, ctx, "create_activation", {
    title: "Create activation",
    description:
      "Assign a promoter to an outlet for a date range (an 'activation'), optionally with a covering supervisor. " +
      "Find ids with lookup_catalog (outlets) and list_staff. Requires an adm/usr user.",
    input: {
      campaignId,
      name: z.string().min(1),
      outletId: id("Outlet id"),
      staffId: id("Promoter's staff id"),
      dateFrom: ymd,
      dateTo: ymd,
      supervisorStaffId: z.string().optional().describe("Covering supervisor's staff id"),
      targetType: z.enum(["item_wise", "brand_wise"]).optional(),
      targetCategorization: z.enum(["daily", "monthly"]).optional(),
      targetUnit: z.enum(["unit_wise", "sales_wise"]).optional(),
      activationType: z.enum(["weekend", "monthly"]).optional(),
      shiftStartMinutes: minutes.optional().describe("Minutes after midnight; overrides the campaign shift"),
      shiftEndMinutes: minutes.optional(),
    },
    effect: (a) => `Create activation "${a.name}" (${a.dateFrom} → ${a.dateTo}) for promoter ${a.staffId} at outlet ${a.outletId}`,
    request: ({ campaignId, ...body }) => ({ method: "POST", path: `/campaigns/${campaignId}/activations`, body }),
  });

  writeTool(server, ctx, "update_activation", {
    title: "Update activation",
    description: "Change an activation's dates, promoter, outlet, supervisor or shift window. Requires an adm/usr user.",
    input: {
      campaignId,
      activationId: id("Activation id"),
      name: z.string().min(1).optional(),
      outletId: z.string().optional(),
      staffId: z.string().optional(),
      dateFrom: ymd.optional(),
      dateTo: ymd.optional(),
      supervisorStaffId: z.string().nullable().optional().describe("null removes the supervisor"),
      shiftStartMinutes: minutes.nullable().optional(),
      shiftEndMinutes: minutes.nullable().optional(),
    },
    effect: ({ activationId, campaignId: _c, ...f }) => `Update activation ${activationId}: ${JSON.stringify(f)}`,
    request: ({ campaignId, activationId, ...body }) => ({ method: "PATCH", path: `/campaigns/${campaignId}/activations/${activationId}`, body }),
    before: async ({ campaignId, activationId }, { api }) => (await api.get(`/campaigns/${campaignId}/activations/${activationId}`)).data,
  });

  writeTool(server, ctx, "add_activation_target", {
    title: "Add a sales target",
    description: "Set a target for one item OR one brand on an activation, for a date range. targetValue is units or LKR depending on the activation's targetUnit. Requires an adm/usr user.",
    input: {
      campaignId,
      activationId: id("Activation id"),
      dateFrom: ymd,
      dateTo: ymd,
      targetItemId: z.string().optional().describe("Exactly one of targetItemId / targetBrandId"),
      targetBrandId: z.string().optional(),
      targetValue: z.number().int().min(0),
      repeat: z.boolean().optional().describe("Repeat every period"),
    },
    effect: (a) => `Add target ${a.targetValue} (${a.targetItemId ? `item ${a.targetItemId}` : `brand ${a.targetBrandId}`}) ${a.dateFrom} → ${a.dateTo} on activation ${a.activationId}`,
    request: ({ campaignId, activationId, ...body }) => ({ method: "POST", path: `/campaigns/${campaignId}/activations/${activationId}/targets`, body }),
  });

  writeTool(server, ctx, "create_supervisor_task", {
    title: "Create supervisor checklist task",
    description: "Add a task to the supervisors' outlet-visit checklist. taskType: range (1-5 rating), feedback (free text) or photo (with imageCount). Requires an adm/usr user.",
    input: {
      campaignId,
      category: z.string().min(1),
      task: z.string().min(1),
      taskType: z.enum(["range", "feedback", "photo"]).optional(),
      imageCount: z.number().int().min(0).optional().describe("Photos required (photo tasks)"),
    },
    effect: (a) => `Add ${a.taskType ?? "range"} task "${a.task}" under "${a.category}"`,
    request: ({ campaignId, ...body }) => ({ method: "POST", path: `/campaigns/${campaignId}/supervisor-tasks`, body }),
  });

  writeTool(server, ctx, "assign_supervisor_route", {
    title: "Assign supervisor route",
    description: "Assign a supervisor to visit a set of outlets over a date range. Requires an adm/usr user.",
    input: {
      campaignId,
      supervisorStaffId: id("Supervisor's staff id"),
      outletIds: z.array(z.string().min(1)).min(1),
      dateFrom: ymd,
      dateTo: ymd,
    },
    effect: (a) => `Route supervisor ${a.supervisorStaffId} to ${a.outletIds.length} outlet(s), ${a.dateFrom} → ${a.dateTo}`,
    request: ({ campaignId, ...body }) => ({ method: "POST", path: `/campaigns/${campaignId}/supervisor-routes`, body }),
  });
}
