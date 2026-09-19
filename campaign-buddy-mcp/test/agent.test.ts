import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { IntelligenceAgent, type WritePreview } from "../src/client/agent.js";
import { connect } from "./helpers.js";

type Block = Record<string, unknown>;
const msg = (content: Block[], stop_reason: string, extra: Block = {}) => ({
  content,
  stop_reason,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50 },
  ...extra,
});
const toolUse = (id: string, name: string, input: Block) => ({ type: "tool_use", id, name, input });
const say = (text: string) => ({ type: "text", text });

/** Scripted stand-in for the Anthropic SDK: returns the queued replies in order and records each request. */
function fakeAnthropic(replies: ReturnType<typeof msg>[]) {
  const requests: any[] = [];
  const queue = [...replies];
  const anthropic = {
    beta: {
      messages: {
        stream: (params: any) => {
          requests.push(JSON.parse(JSON.stringify(params)));
          const reply = queue.shift();
          if (!reply) throw new Error("unexpected extra model call");
          return { on: vi.fn(), finalMessage: async () => reply };
        },
      },
    },
  } as unknown as Anthropic;
  return { anthropic, requests };
}

const leaveRoutes = { "PATCH /campaigns/c1/leave-requests/l1": (r: any) => ({ body: { data: { id: "l1", status: r.body.status } } }) };
const writeCall = toolUse("t1", "decide_leave_request", { campaignId: "c1", leaveRequestId: "l1", status: "approved" });

describe("IntelligenceAgent", () => {
  it("runs the tool loop: calls a read tool, feeds the result back, returns the final answer", async () => {
    const { client, calls } = await connect({ "GET /campaigns": { data: [{ id: "c1", name: "Radiance", status: "active" }], meta: { total: 1 } } });
    const { anthropic, requests } = fakeAnthropic([
      msg([say("Checking."), toolUse("t1", "list_campaigns", {})], "tool_use"),
      msg([say("You have 1 active campaign: Radiance.")], "end_turn"),
    ]);
    const agent = new IntelligenceAgent(client, anthropic, { approve: async () => false });
    const r = await agent.ask("what campaigns do I have?");

    expect(r).toMatchObject({ text: "You have 1 active campaign: Radiance.", turns: 2, toolCalls: 1 });
    expect(calls.some((c) => c.path === "/campaigns")).toBe(true);
    const followUp = requests[1].messages.at(-1);
    expect(followUp.role).toBe("user");
    expect(followUp.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(followUp.content[0].content).toContain("Radiance");
    // the assistant turn was replayed verbatim
    expect(requests[1].messages.at(-2).content[1]).toMatchObject({ type: "tool_use", id: "t1" });
  });

  it("hides confirmationToken from the model and marks writes as needing approval", async () => {
    const { client } = await connect(leaveRoutes);
    const { anthropic, requests } = fakeAnthropic([msg([say("hi")], "end_turn")]);
    await new IntelligenceAgent(client, anthropic, { approve: async () => false }).ask("hello");
    const tool = requests[0].tools.find((t: any) => t.name === "decide_leave_request");
    expect(tool.input_schema.properties).not.toHaveProperty("confirmationToken");
    expect(tool.description).toMatch(/user must approve/);
    expect(tool.description).not.toMatch(/TWO-STEP/);
    expect(requests[0]).toMatchObject({ model: "claude-opus-5", thinking: { type: "adaptive" }, fallbacks: "default" });
  });

  it("a declined write never reaches the backend, and the model is told not to retry", async () => {
    const { client, calls } = await connect(leaveRoutes);
    const { anthropic, requests } = fakeAnthropic([msg([writeCall], "tool_use"), msg([say("Understood, left as is.")], "end_turn")]);
    const approve = vi.fn(async (_p: WritePreview) => false);
    const r = await new IntelligenceAgent(client, anthropic, { approve }).ask("approve leave l1");

    expect(approve).toHaveBeenCalledOnce();
    expect(approve.mock.calls[0][0]).toMatchObject({ action: "decide_leave_request", request: { method: "PATCH" } });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(requests[1].messages.at(-1).content[0].content).toMatch(/declined.*Nothing was modified/s);
    expect(r.text).toBe("Understood, left as is.");
  });

  it("an approved write executes exactly once, with the token the model never saw", async () => {
    const { client, calls } = await connect(leaveRoutes);
    const { anthropic, requests } = fakeAnthropic([msg([writeCall], "tool_use"), msg([say("Approved.")], "end_turn")]);
    await new IntelligenceAgent(client, anthropic, { approve: async () => true }).ask("approve leave l1");

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ status: "approved" });
    const result = requests[1].messages.at(-1).content[0];
    expect(result.is_error).toBeUndefined();
    expect(JSON.parse(result.content)).toMatchObject({ status: "done" });
  });

  it("does not pass a model-supplied confirmationToken through to bypass approval", async () => {
    const { client, calls } = await connect(leaveRoutes);
    const sneaky = toolUse("t1", "decide_leave_request", { campaignId: "c1", leaveRequestId: "l1", status: "approved", confirmationToken: "guess" });
    const { anthropic } = fakeAnthropic([msg([sneaky], "tool_use"), msg([say("ok")], "end_turn")]);
    await new IntelligenceAgent(client, anthropic, { approve: async () => false }).ask("x");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("keeps conversation history across questions, and reset() clears it", async () => {
    const { client } = await connect({});
    const { anthropic, requests } = fakeAnthropic([msg([say("a")], "end_turn"), msg([say("b")], "end_turn"), msg([say("c")], "end_turn")]);
    const agent = new IntelligenceAgent(client, anthropic, { approve: async () => false });
    await agent.ask("first");
    await agent.ask("second");
    expect(requests[1].messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user"]);
    agent.reset();
    await agent.ask("third");
    expect(requests[2].messages).toHaveLength(1);
  });

  it("surfaces a refusal as an error and does not poison the history", async () => {
    const { client } = await connect({});
    const { anthropic, requests } = fakeAnthropic([
      msg([], "refusal", { stop_details: { category: "cyber" } }),
      msg([say("fine")], "end_turn"),
    ]);
    const agent = new IntelligenceAgent(client, anthropic, { approve: async () => false });
    await expect(agent.ask("bad")).rejects.toThrow(/declined to answer \(cyber\)/);
    await agent.ask("good");
    expect(requests[1].messages).toHaveLength(1);
  });

  it("stops runaway tool loops at maxTurns", async () => {
    const { client } = await connect({ "GET /campaigns": { data: [], meta: { total: 0 } } });
    const loop = () => msg([toolUse("t", "list_campaigns", {})], "tool_use");
    const { anthropic } = fakeAnthropic([loop(), loop(), loop()]);
    await expect(new IntelligenceAgent(client, anthropic, { approve: async () => false, maxTurns: 3 }).ask("x")).rejects.toThrow(/Stopped after 3/);
  });
});
