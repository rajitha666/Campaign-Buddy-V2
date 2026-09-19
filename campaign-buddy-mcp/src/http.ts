#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CampaignBuddyApi } from "./api.js";
import { ConfirmationStore } from "./confirm.js";
import { loadConfig, requireCredentials } from "./config.js";
import { buildServer } from "./server.js";

// Remote transport (Streamable HTTP, stateless): one MCP endpoint at /mcp. Every
// request must carry `Authorization: Bearer $CB_MCP_HTTP_TOKEN`, and the server
// acts as the single configured portal user. Put it behind TLS if it leaves localhost.
const cfg = loadConfig();
requireCredentials(cfg);
if (!cfg.http.token || cfg.http.token.length < 24) {
  throw new Error("Set CB_MCP_HTTP_TOKEN to a random string of at least 24 characters (e.g. `openssl rand -base64 32`).");
}

const api = new CampaignBuddyApi(cfg.apiBaseUrl, { username: cfg.username, password: cfg.password });
// Stateless HTTP builds a fresh server per request, so the confirmation store must outlive them.
const confirmations = new ConfirmationStore();

function authorised(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const want = Buffer.from(cfg.http.token);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/health") return send(res, 200, { status: "ok", service: "campaign-buddy-mcp" });
    if (path !== "/mcp") return send(res, 404, { error: "Not found" });
    if (!authorised(req)) return send(res, 401, { error: "Unauthorized" });
    if (req.method !== "POST") {
      return send(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: POST only)" }, id: null });
    }

    const body = await readJson(req);
    const server = buildServer(api, { readOnly: cfg.readOnly, confirmations });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error("MCP request failed:", (e as Error).message);
    if (!res.headersSent) send(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
}).listen(cfg.http.port, cfg.http.host, () => {
  console.error(`campaign-buddy MCP (http) on http://${cfg.http.host}:${cfg.http.port}/mcp → ${cfg.apiBaseUrl} ${cfg.readOnly ? "[read-only]" : "[read+write]"}`);
});
