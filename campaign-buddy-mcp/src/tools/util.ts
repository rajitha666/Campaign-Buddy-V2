import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CampaignBuddyApi, CbApiError, type ApiEnvelope } from "../api.js";
import { fit, slim } from "../shape.js";
import type { ConfirmationStore } from "../confirm.js";

export interface Ctx {
  api: CampaignBuddyApi;
  readOnly: boolean;
  confirmations: ConfirmationStore;
}

export const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const campaignId = z.string().min(1).describe("Campaign id (get it from list_campaigns)");
export const dateFrom = ymd.optional().describe("Inclusive start date, YYYY-MM-DD");
export const dateTo = ymd.optional().describe("Inclusive end date, YYYY-MM-DD");
export const outletId = z.string().optional().describe("Restrict to one outlet id (see lookup_catalog kind=outlets)");
export const paging = {
  page: z.number().int().min(1).optional().describe("1-based page (default 1)"),
  pageSize: z.number().int().min(1).max(200).optional().describe("Rows per page (default 25, max 200)"),
};

export function text(payload: Record<string, unknown> | string): CallToolResult {
  return { content: [{ type: "text", text: typeof payload === "string" ? payload : fit(payload as Record<string, unknown>) }] };
}

/** Turn an envelope from the API into the shape we hand to a model. */
export function rows(env: ApiEnvelope, extra: Record<string, unknown> = {}): CallToolResult {
  const data = slim(env.data);
  if (Array.isArray(data)) {
    return text({ total: env.meta?.total ?? data.length, count: data.length, ...(env.meta?.grandTotal !== undefined ? { grandTotal: env.meta.grandTotal } : {}), ...extra, rows: data });
  }
  return text({ ...extra, data });
}

export function fail(err: unknown): CallToolResult {
  if (err instanceof CbApiError) {
    const hint =
      err.status === 403 ? " The service user's role or campaign access does not allow this."
      : err.status === 404 ? " Check the id — use the list_/lookup_ tools to find valid ids."
      : "";
    return { isError: true, content: [{ type: "text", text: `Campaign Buddy API error ${err.status} ${err.code}: ${err.message}${err.field ? ` (field: ${err.field})` : ""}.${hint}` }] };
  }
  return { isError: true, content: [{ type: "text", text: `Error: ${(err as Error)?.message ?? String(err)}` }] };
}

type Shape = z.ZodRawShape;

/** Register a read-only tool. Errors become isError results instead of protocol errors. */
export function readTool<S extends Shape>(
  server: McpServer,
  name: string,
  def: { title: string; description: string; input: S },
  run: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>,
) {
  server.registerTool(
    name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (async (args: z.infer<z.ZodObject<S>>) => {
      try { return await run(args); } catch (e) { return fail(e); }
    }) as any,
  );
}
