import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CampaignBuddyApi } from "../src/api.js";
import { buildServer } from "../src/server.js";

export type Handler = (req: { method: string; path: string; query: URLSearchParams; body: any; auth: string | null }) => { status?: number; body?: unknown };

/** A fake Campaign Buddy backend: records every call, answers from `routes` keyed "METHOD /path". */
export function fakeBackend(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; query: string; body: any; auth: string | null }[] = [];
  const impl = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/admin\/v1/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method, path, query: url.search, body, auth });
    const hit = routes[`${method} ${path}`];
    if (hit === undefined) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `no route ${method} ${path}` } }), { status: 404 });
    const out = typeof hit === "function" ? (hit as Handler)({ method, path, query: url.searchParams, body, auth }) : hit && typeof hit === "object" && "status" in hit ? (hit as { status: number; body?: unknown }) : { body: hit };
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200 });
  }) as typeof fetch;
  return { fetch: impl, calls };
}

export const loginRoute = { "POST /auth/login": { data: { accessToken: "tok-1", user: { id: "u1", displayName: "Tester", roleId: "adm" } } } };

export async function connect(routes: Record<string, Handler | unknown>, opts: { readOnly?: boolean } = {}) {
  const backend = fakeBackend({ ...loginRoute, ...routes });
  const api = new CampaignBuddyApi("http://cb.test", { username: "svc", password: "pw" }, backend.fetch);
  const server = buildServer(api, opts);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    const raw = res.content[0].text;
    let json: any;
    try { json = JSON.parse(raw); } catch { json = undefined; }
    return { isError: !!res.isError, raw, json };
  };
  return { client, call, calls: backend.calls };
}
