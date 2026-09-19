import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

export type McpTarget =
  | { kind: "http"; url: string; token: string }
  | { kind: "stdio"; env: Record<string, string> };

/** Connect to a Campaign Buddy MCP server: a remote HTTP endpoint, or a local child process over stdio. */
export async function connectMcp(target: McpTarget): Promise<Client> {
  const client = new Client({ name: "campaign-buddy-intelligence", version: "0.1.0" });

  if (target.kind === "http") {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(target.url), {
        requestInit: { headers: { Authorization: `Bearer ${target.token}` } },
      }),
    );
    return client;
  }

  // Spawn our own stdio server next to this file — compiled (.js) or straight from source (.ts via tsx).
  const here = fileURLToPath(import.meta.url);
  const isTs = extname(here) === ".ts";
  const entry = fileURLToPath(new URL(isTs ? "../stdio.ts" : "../stdio.js", import.meta.url));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: isTs ? ["--import", "tsx", entry] : [entry],
      env: { ...process.env, ...target.env } as Record<string, string>,
      stderr: "inherit",
    }),
  );
  return client;
}
