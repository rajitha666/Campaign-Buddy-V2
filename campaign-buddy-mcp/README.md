# Campaign Buddy MCP + Intelligence

An [MCP](https://modelcontextprotocol.io) server that lets an LLM **read Campaign Buddy data and act on a user's behalf**, plus an **Intelligence client** — an agent loop on the Claude API that uses that server. It is the foundation for "CampaignBuddy Intelligence".

```
 Claude Desktop / Claude Code / any MCP host ─┐
                                              ├─ MCP (stdio | Streamable HTTP) ─► campaign-buddy-mcp ─► /admin/v1 ─► backend ─► Postgres
 Intelligence client (src/client) ────────────┘                                       (this package)     (existing API, unchanged)
```

**Design rule: the MCP server never touches the database.** Every read and write goes through the same `/admin/v1` routes the portal uses, so the backend's role rules (`adm` / `usr` / `supervisor` / `sponsor`) and per-campaign / per-outlet grants apply to the LLM exactly as they would to that person in CB Office. No backend changes were needed.

## Quick start

```bash
cd campaign-buddy-mcp
npm install
cp .env.example .env        # set CB_API_BASE_URL, CB_USERNAME, CB_PASSWORD
npm run build
npm test                    # no DB needed
```

`CB_USERNAME` / `CB_PASSWORD` is the portal user the server acts as. **Create a dedicated user for it** (role + campaign grants = the ceiling of what any LLM can see or do). A sponsor-role user gives a safe read-only assistant; `usr` enables the write tools.

### Use it from an MCP host

Claude Code:

```bash
claude mcp add campaign-buddy --env CB_API_BASE_URL=http://localhost:4000 --env CB_USERNAME=... --env CB_PASSWORD=... -- node /abs/path/campaign-buddy-mcp/dist/src/stdio.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "campaign-buddy": {
  "command": "node",
  "args": ["/abs/path/campaign-buddy-mcp/dist/src/stdio.js"],
  "env": { "CB_API_BASE_URL": "http://localhost:4000", "CB_USERNAME": "...", "CB_PASSWORD": "..." }
} } }
```

Remote / shared (Streamable HTTP, stateless): set `CB_MCP_HTTP_TOKEN` (≥24 random chars) and run `npm run start:http` → `POST http://host:4300/mcp` with `Authorization: Bearer <token>`. It binds to `127.0.0.1` by default; put TLS in front before exposing it.

### Use the Intelligence client

```bash
export ANTHROPIC_API_KEY=...            # plus the CB_* vars
npm run intel -- "How did Radiance Q3 Push do this week, and who should I coach?"
npm run intel                            # interactive chat
npm run intel -- --read-only "..."      # hide every write tool
npm run intel -- --url http://host:4300/mcp "..."   # use a running HTTP server
```

Programmatic use (e.g. from the backend or portal):

```ts
const mcp = await connectMcp({ kind: "http", url, token });
const agent = new IntelligenceAgent(mcp, new Anthropic(), {
  approve: async (preview) => showToUserAndWaitForYesNo(preview),   // required — every write goes through this
  onText: (d) => stream(d),
});
const { text } = await agent.ask("Which outlets are under target today?");
```

Defaults: `claude-opus-5`, adaptive thinking, streaming, prompt caching on the tools+system prefix, server-side refusal fallbacks (`fallbacks: "default"`).

## Tools

**Read (20, all `readOnlyHint`)** — `whoami`, `list_campaigns`, `get_campaign`, `campaign_overview` (one-shot daily snapshot), `get_report` (sku-wise, brand-wise, outlet-wise, sales-status, reorder, attendance-monthly), `get_sales_records`, `get_daily_stats`, `get_attendance`, `get_absence`, `get_outlet_attendance`, `get_live_tracking`, `list_activations`, `get_activation` (+ targets & progress), `list_leave_requests`, `list_staff`, `get_staff_evaluation`, `lookup_catalog`, `get_supervisor_checklist_results`, `get_license_usage`, and `api_get` (read-only GET escape hatch; `/auth`, `/users`, `/roles` blocked).

**Write (8, `destructiveHint`)** — `update_campaign`, `decide_leave_request`, `correct_sales_record`, `create_activation`, `update_activation`, `add_activation_target`, `create_supervisor_task`, `assign_supervisor_route`.

Deliberately **not** exposed: deletes, user / role / access-grant management, license caps, staff creation, and `PATCH /stats/today` (it targets "the first activation covering today", which is ambiguous for an LLM).

**Also served:** resource `campaignbuddy://glossary` (entities, roles, metric formulas, business rules) and prompts `daily_briefing`, `weekly_performance_review`, `attendance_exceptions`.

## Security model

| Layer | What it does |
|---|---|
| **Backend RBAC** | The real boundary. Writes by `supervisor` / `sponsor` users return 403 even after confirmation; reads are outlet-scoped by grant. (Verified against a live backend.) |
| **Redaction** (`src/shape.ts`) | The admin API returns whole Prisma rows. NIC, bank details, DOB, addresses, emergency contacts, staff phone / mobile login, and hashes are stripped from **every** tool result, including `api_get`, before anything reaches an LLM provider. |
| **Two-step writes** (`src/confirm.ts`) | A write tool first returns a preview (`effect`, exact request, current values) and a single-use, 5-minute token bound to the exact arguments. Only a second call with that token executes. |
| **Human approval** | The token is *not* the boundary — a model can see it. The boundary is the human in front of it: MCP hosts prompt on `destructiveHint` tools, and the Intelligence client runs the two steps itself, hides the token schema from the model, and only confirms after `approve()` returns true (declines are reported back as "do not retry"). |
| **Read-only switch** | `CB_MCP_READ_ONLY=1` (or `--read-only`) doesn't register write tools at all. |
| **HTTP** | Bearer token (constant-time compare), 1 MB body cap, loopback bind by default. |

## Known gaps / next steps

- **Service-account auth.** The backend issues 8 h user JWTs with no refresh; the server re-logs-in with the configured credentials. A first-class API-key / OAuth flow would allow per-end-user identity (today all HTTP clients share one service user).
- **Existing backend scoping.** `GET /staff` and `GET /staff/:id/evaluation` are not campaign-scoped, so any role — including a sponsor — can list all active staff (names only after redaction). The MCP faithfully inherits this; the fix belongs in the backend.
- **Audit trail.** Writes carry the service user's identity, not the human who approved them. Add an `X-On-Behalf-Of` header + backend audit log when Intelligence is exposed to end users.
- **Intelligence roadmap:** scheduled briefings (daily digest to sponsors), anomaly alerts (geofence / footfall drops), natural-language report export, evals over a fixed question set.
- The agent loop is covered by tests against a scripted model; it has not been run against the live Claude API in CI (needs `ANTHROPIC_API_KEY`).

## Layout

```
src/api.ts            typed /admin/v1 client (login, 401 → re-login, error mapping)
src/shape.ts          redaction + payload sizing
src/confirm.ts        single-use confirmation tokens
src/tools/read.ts     read tools        src/tools/write.ts   write tools
src/server.ts         buildServer() — tools, glossary resource, prompts
src/stdio.ts          src/http.ts       transports
src/client/           agent.ts (loop + approval gate), connect.ts, cli.ts
test/                 in-memory MCP client ↔ server, fake backend, scripted model
scripts/smoke.ts      npm run smoke — drives every read tool against a live backend
```
