#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { IntelligenceAgent, type WritePreview } from "./agent.js";
import { connectMcp, type McpTarget } from "./connect.js";

const USAGE = `Campaign Buddy Intelligence

  npm run intel -- "how did Radiance Q3 Push do yesterday?"     one question
  npm run intel                                                    interactive chat

Options
  --url <http://host:4300/mcp>   use a running MCP HTTP server (needs CB_MCP_HTTP_TOKEN); default: spawn a local stdio server
  --read-only                    hide every write tool
  --yes                          approve writes without asking (unattended runs; use with care)
  --model <id>                   default $CB_INTEL_MODEL or claude-opus-5

Env: ANTHROPIC_API_KEY, CB_API_BASE_URL, CB_USERNAME, CB_PASSWORD (see .env.example)`;

function parseArgs(argv: string[]) {
  const flags = { url: "", readOnly: false, yes: false, model: process.env.CB_INTEL_MODEL || "claude-opus-5", help: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") flags.url = argv[++i] ?? "";
    else if (a === "--model") flags.model = argv[++i] ?? flags.model;
    else if (a === "--read-only") flags.readOnly = true;
    else if (a === "--yes") flags.yes = true;
    else if (a === "-h" || a === "--help") flags.help = true;
    else rest.push(a);
  }
  return { flags, question: rest.join(" ").trim() };
}

const dim = (s: string) => (stderr.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

async function main() {
  const { flags, question } = parseArgs(process.argv.slice(2));
  if (flags.help) return void console.log(USAGE);

  const rl = createInterface({ input: stdin, output: stderr });
  const interactive = stdin.isTTY === true;

  const approve = async (p: WritePreview) => {
    if (flags.yes) return true;
    if (!interactive) { stderr.write(dim(`  ✗ ${p.effect} — declined (no TTY; pass --yes to allow)\n`)); return false; }
    stderr.write(`\n┌ Change requested: ${p.action}\n│ ${p.effect}\n│ ${p.request.method} ${p.request.path}\n│ ${JSON.stringify(p.request.body)}\n`);
    if (p.currentValues) stderr.write(`│ current: ${JSON.stringify(p.currentValues).slice(0, 400)}\n`);
    const answer = (await rl.question("└ Apply this change? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  };

  const target: McpTarget = flags.url
    ? { kind: "http", url: flags.url, token: process.env.CB_MCP_HTTP_TOKEN ?? "" }
    : { kind: "stdio", env: flags.readOnly ? { CB_MCP_READ_ONLY: "1" } : {} };
  const mcp = await connectMcp(target);

  const agent = new IntelligenceAgent(mcp, new Anthropic(), {
    model: flags.model,
    approve,
    onText: (d) => stdout.write(d),
    onToolCall: (name, input, write) => stderr.write(dim(`  ${write ? "✎" : "→"} ${name} ${JSON.stringify(input)}\n`)),
    onToolResult: (name, ok, text) => { if (!ok) stderr.write(dim(`  ! ${name}: ${text.slice(0, 200)}\n`)); },
  });

  const ask = async (q: string) => {
    try {
      const r = await agent.ask(q);
      stdout.write("\n");
      stderr.write(dim(`  [${r.toolCalls} tool calls · ${r.usage.inputTokens} in (${r.usage.cacheReadTokens} cached) / ${r.usage.outputTokens} out]\n`));
    } catch (e) {
      stderr.write(`\nError: ${(e as Error).message}\n`);
      process.exitCode = 1;
    }
  };

  try {
    if (question) {
      await ask(question);
    } else if (interactive) {
      stderr.write("Campaign Buddy Intelligence — ask anything about your campaigns. Ctrl+C to exit.\n");
      for (;;) {
        const q = (await rl.question("\n> ")).trim();
        if (q) await ask(q);
      }
    } else {
      console.log(USAGE);
    }
  } finally {
    rl.close();
    await mcp.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
