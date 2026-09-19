#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CampaignBuddyApi } from "./api.js";
import { loadConfig, requireCredentials } from "./config.js";
import { buildServer } from "./server.js";

// stdio transport: stdout carries the protocol, so every diagnostic goes to stderr.
const cfg = loadConfig();
requireCredentials(cfg);

const api = new CampaignBuddyApi(cfg.apiBaseUrl, { username: cfg.username, password: cfg.password });
const server = buildServer(api, { readOnly: cfg.readOnly });

await server.connect(new StdioServerTransport());
console.error(`campaign-buddy MCP (stdio) → ${cfg.apiBaseUrl} ${cfg.readOnly ? "[read-only]" : "[read+write]"}`);
