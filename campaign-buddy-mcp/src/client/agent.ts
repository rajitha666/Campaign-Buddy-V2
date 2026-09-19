import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

type Tool = Anthropic.Beta.Messages.BetaTool;
type Message = Anthropic.Beta.Messages.BetaMessageParam;
type ToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** What a human is asked to approve before any change is made. */
export interface WritePreview {
  action: string;
  effect: string;
  request: { method: string; path: string; body?: unknown };
  currentValues?: unknown;
}

export interface AgentOptions {
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  /** Required: every write goes through this. Resolve false (or never resolve to true) to block it. */
  approve: (preview: WritePreview) => Promise<boolean>;
  onText?: (delta: string) => void;
  onToolCall?: (name: string, input: unknown, write: boolean) => void;
  onToolResult?: (name: string, ok: boolean, text: string) => void;
}

export interface AskResult {
  text: string;
  turns: number;
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

const SYSTEM = `You are Campaign Buddy Intelligence, an operations analyst embedded in a field-marketing platform. \
You answer questions about campaigns, outlets, promoters, sales, attendance and targets, and you can carry out routine admin tasks — all through the tools provided.

How to work:
- Ground every claim in data you fetched with a tool this conversation. If you did not retrieve it, do not state it. Never invent ids, names or numbers.
- Start with whoami if you need the current date or the user's permissions. Prefer campaign_overview and get_report for aggregates; drill down only where the numbers point.
- Fetch independent data in parallel. Stop fetching once you can answer.
- Always give the date range a figure covers, currency as LKR, and rates as percentages with the formula (conversion = converted / approached).
- If a result says "truncated", say so and narrow the query rather than guessing at the missing rows.
- Lead with the answer, then the evidence, then recommended actions. Be concise; use a table when comparing more than three things.
- Write tools change real data. Say in one sentence what you intend before calling one. The user is shown the exact change and must approve it; if they decline, do not retry or route around it. \
Only make changes the user actually asked for — analysis and recommendations are not requests to change anything.
- A 403 means the user's role does not permit it. Report that plainly.`;

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content.map((c: any) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
}

export class IntelligenceAgent {
  private tools: Tool[] = [];
  private writeTools = new Set<string>();
  private system = SYSTEM;
  private history: Message[] = [];
  private ready?: Promise<void>;

  constructor(
    private mcp: Client,
    private anthropic: Anthropic,
    private opts: AgentOptions,
  ) {}

  /** Discover tools once. The model never sees `confirmationToken` — this client owns the confirm step. */
  private init(): Promise<void> {
    this.ready ??= (async () => {
      const { tools } = await this.mcp.listTools();
      this.tools = tools.map((t) => {
        const isWrite = t.annotations?.readOnlyHint === false;
        const schema: any = JSON.parse(JSON.stringify(t.inputSchema));
        if (isWrite && schema.properties) delete schema.properties.confirmationToken;
        if (isWrite) this.writeTools.add(t.name);
        return {
          name: t.name,
          description: (t.description ?? "").replace(/\n\nTWO-STEP:[\s\S]*$/, "\n\nChanges data: the user must approve before it takes effect."),
          input_schema: schema,
        } as Tool;
      });
      const server = this.mcp.getInstructions();
      if (server) this.system = `${SYSTEM}\n\nServer notes:\n${server}`;
    })();
    return this.ready;
  }

  reset() {
    this.history = [];
  }

  private async callMcp(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
    try {
      const res: any = await this.mcp.callTool({ name, arguments: args });
      return { isError: !!res.isError, text: textOf(res.content) };
    } catch (e) {
      return { isError: true, text: `Tool call failed: ${(e as Error).message}` };
    }
  }

  private async run(use: ToolUse): Promise<ToolResult> {
    const input = (use.input ?? {}) as Record<string, unknown>;
    const isWrite = this.writeTools.has(use.name);
    this.opts.onToolCall?.(use.name, input, isWrite);

    let out: { isError: boolean; text: string };
    if (!isWrite) {
      out = await this.callMcp(use.name, input);
    } else {
      // Step 1: server previews, changes nothing. Step 2: only if the human approves.
      const preview = await this.callMcp(use.name, input);
      let parsed: any;
      try { parsed = JSON.parse(preview.text); } catch { /* not a preview */ }
      if (preview.isError || parsed?.status !== "confirmation_required") {
        out = preview;
      } else {
        const approved = await this.opts.approve({
          action: parsed.action,
          effect: parsed.effect,
          request: parsed.request,
          currentValues: parsed.currentValues,
        });
        out = approved
          ? await this.callMcp(use.name, { ...input, confirmationToken: parsed.confirmationToken })
          : { isError: false, text: "The user declined this change. Nothing was modified. Do not retry it or work around it; ask what they would like instead." };
      }
    }
    this.opts.onToolResult?.(use.name, !out.isError, out.text);
    return { type: "tool_result", tool_use_id: use.id, content: out.text, ...(out.isError ? { is_error: true } : {}) };
  }

  async ask(question: string): Promise<AskResult> {
    await this.init();
    const { model = "claude-opus-5", maxTurns = 25, maxTokens = 32_000 } = this.opts;
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let toolCalls = 0;
    let finalText = "";

    // Work on a copy so a failed turn doesn't leave dangling tool_use blocks in the history.
    const messages: Message[] = [...this.history, { role: "user", content: question }];

    for (let turn = 1; turn <= maxTurns; turn++) {
      const stream = this.anthropic.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        // Stable prefix (tools + system) is cached across turns of the loop and across questions.
        system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
        tools: this.tools,
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (this.opts.onText) stream.on("text", this.opts.onText);
      const msg = await stream.finalMessage();

      usage.inputTokens += msg.usage.input_tokens;
      usage.outputTokens += msg.usage.output_tokens;
      usage.cacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;

      // Append the whole content array (thinking blocks included) — the API needs it back verbatim.
      messages.push({ role: "assistant", content: msg.content as Message["content"] });
      finalText = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");

      if (msg.stop_reason === "refusal") throw new Error(`The model declined to answer (${msg.stop_details?.category ?? "policy"}).`);
      if (msg.stop_reason === "max_tokens") throw new Error("The answer hit the output limit before finishing; ask a narrower question.");
      if (msg.stop_reason !== "tool_use") {
        this.history = messages;
        return { text: finalText, turns: turn, toolCalls, usage };
      }

      const uses = msg.content.filter((b): b is ToolUse => b.type === "tool_use");
      toolCalls += uses.length;
      // Reads run in parallel. Writes each need a human decision, so they run one at a time, in order.
      const results = new Array<ToolResult>(uses.length);
      await Promise.all(uses.filter((u) => !this.writeTools.has(u.name)).map(async (u) => { results[uses.indexOf(u)] = await this.run(u); }));
      for (const u of uses) if (this.writeTools.has(u.name)) results[uses.indexOf(u)] = await this.run(u);

      messages.push({ role: "user", content: results });
    }
    throw new Error(`Stopped after ${maxTurns} tool-use turns without a final answer.`);
  }
}
