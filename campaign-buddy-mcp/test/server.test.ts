import { describe, expect, it } from "vitest";
import { connect } from "./helpers.js";
import { fit, slim } from "../src/shape.js";

const staffWithPii = {
  id: "s1", employeeId: "E1", fullName: "Nimal Perera", userType: "promoter", phone: "0771234567", mobileUsername: "nimal",
  nic: "199012345678", bankAccountNumber: "123456", bankName: "BoC", permanentAddress: "1 Galle Rd", dateOfBirth: "1990-01-01",
  emergencyContactPhone: "0779999999", passwordHash: "x", createdAt: "2026-01-01", cityId: null,
};

describe("redaction", () => {
  it("strips HR/banking/PII and nulls from staff rows, including nested ones", () => {
    const out = JSON.stringify(slim({ rows: [{ id: "a1", staff: staffWithPii, note: null }] }));
    for (const leaked of ["199012345678", "123456", "BoC", "Galle", "1990-01-01", "0771234567", "0779999999", "nimal\"", "createdAt", "passwordHash"]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain("Nimal Perera");
  });

  it("keeps an outlet's business phone", () => {
    expect(JSON.stringify(slim({ id: "o1", name: "Keells", phone: "0112345678" }))).toContain("0112345678");
  });

  it("never returns PII through list_staff", async () => {
    const { call } = await connect({ "GET /staff": { data: [staffWithPii], meta: { total: 1 } } });
    const r = await call("list_staff");
    expect(r.raw).toContain("Nimal Perera");
    expect(r.raw).not.toMatch(/199012345678|bankAccountNumber|Galle/);
  });
});

describe("fit", () => {
  it("halves the biggest array and reports truncation", () => {
    const big = { total: 500, rows: Array.from({ length: 500 }, (_, i) => ({ i, pad: "x".repeat(200) })) };
    const parsed = JSON.parse(fit(big, 5000));
    expect(parsed.rows.length).toBeLessThan(500);
    expect(parsed.truncated).toMatchObject({ field: "rows", available: 500 });
  });
});

describe("read tools", () => {
  it("flattens sales rows and computes value, keeping the id needed for corrections", async () => {
    const { call, calls } = await connect({
      "GET /campaigns/c1/sales": {
        data: [{
          id: "sr1", date: "2026-09-01T00:00:00.000Z", openingStock: 10, soldToday: 4, otherInterestedCustomers: 1, reorderFlag: false,
          activationItem: { campaignItem: { item: { name: "Soap", unitPrice: 250 } }, activation: { outletId: "o1", outlet: { name: "Keells" }, staff: staffWithPii } },
        }],
        meta: { total: 1 },
      },
    });
    const r = await call("get_sales_records", { campaignId: "c1", dateFrom: "2026-09-01" });
    expect(r.json.rows[0]).toMatchObject({ salesRecordId: "sr1", date: "2026-09-01", outlet: "Keells", promoter: "Nimal Perera", item: "Soap", salesValue: 1000 });
    expect(calls.find((c) => c.path === "/campaigns/c1/sales")!.query).toBe("?dateFrom=2026-09-01");
  });

  it("campaign_overview survives one sub-call failing", async () => {
    const { call } = await connect({
      "GET /campaigns/c1": { data: { id: "c1", name: "Radiance" } },
      "GET /campaigns/c1/reports/outlet-wise": { data: [{ outletName: "Keells", totalSales: 900 }], meta: { grandTotal: 900 } },
      "GET /campaigns/c1/absence": { status: 500, body: { error: { code: "X", message: "boom" } } },
      "GET /campaigns/c1/tracking/live": { data: [] , meta: { total: 0 } },
    } as any);
    const r = await call("campaign_overview", { campaignId: "c1", date: "2026-09-01" });
    expect(r.isError).toBe(false);
    expect(r.json.outlets[0].outletName).toBe("Keells");
    expect(r.json.absentToday.error).toBeTruthy();
  });

  it("turns API errors into isError results with a hint", async () => {
    const { call } = await connect({ "GET /campaigns/c9": { status: 403, body: { error: { code: "CAMPAIGN_ACCESS_DENIED", message: "nope" } } }, "GET /campaigns/c9/items": { status: 403, body: { error: { code: "CAMPAIGN_ACCESS_DENIED", message: "nope" } } } } as any);
    const r = await call("get_campaign", { campaignId: "c9" });
    expect(r.isError).toBe(true);
    expect(r.raw).toMatch(/403 CAMPAIGN_ACCESS_DENIED/);
  });

  it("api_get refuses the auth and user-admin surface", async () => {
    const { call, calls } = await connect({});
    for (const path of ["/auth/login", "/users", "/roles/x", "/campaigns/../users"]) {
      expect((await call("api_get", { path })).isError).toBe(true);
    }
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(0);
  });
});

describe("api client", () => {
  it("logs in once, sends the bearer token, and re-logs-in on a 401", async () => {
    let n = 0;
    const { call, calls } = await connect({
      "GET /campaigns": () => (++n === 1 ? { status: 401, body: { error: { code: "TOKEN_EXPIRED", message: "expired" } } } : { body: { data: [] } }),
    });
    expect((await call("list_campaigns")).isError).toBe(false);
    expect(calls.filter((c) => c.path === "/auth/login")).toHaveLength(2); // initial + retry after 401
    expect(calls.filter((c) => c.path === "/campaigns").every((c) => c.auth === "Bearer tok-1")).toBe(true);
  });
});

describe("write tools", () => {
  const leave = { "PATCH /campaigns/c1/leave-requests/l1": (r: any) => ({ body: { data: { id: "l1", status: r.body.status } } }) };
  const args = { campaignId: "c1", leaveRequestId: "l1", status: "approved" };

  it("previews first and changes nothing", async () => {
    const { call, calls } = await connect(leave);
    const r = await call("decide_leave_request", args);
    expect(r.json.status).toBe("confirmation_required");
    expect(r.json.confirmationToken).toBeTruthy();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("executes only with the token and identical arguments, and the token is single-use", async () => {
    const { call, calls } = await connect(leave);
    const token = (await call("decide_leave_request", args)).json.confirmationToken;

    const tampered = await call("decide_leave_request", { ...args, status: "declined", confirmationToken: token });
    expect(tampered.isError).toBe(true);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    const token2 = (await call("decide_leave_request", args)).json.confirmationToken;
    const done = await call("decide_leave_request", { ...args, confirmationToken: token2 });
    expect(done.json).toMatchObject({ status: "done", result: { id: "l1", status: "approved" } });
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);

    const replay = await call("decide_leave_request", { ...args, confirmationToken: token2 });
    expect(replay.isError).toBe(true);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  it("surfaces backend refusals (read-only roles) as errors after confirmation", async () => {
    const { call } = await connect({
      "PATCH /campaigns/c1/leave-requests/l1": { status: 403, body: { error: { code: "READ_ONLY_ROLE", message: "no" } } },
    } as any);
    const token = (await call("decide_leave_request", args)).json.confirmationToken;
    const r = await call("decide_leave_request", { ...args, confirmationToken: token });
    expect(r.isError).toBe(true);
    expect(r.raw).toMatch(/READ_ONLY_ROLE/);
  });

  it("shows current values in an update preview", async () => {
    const { call } = await connect({ "GET /campaigns/c1": { data: { id: "c1", name: "Old name", status: "active" } } });
    const r = await call("update_campaign", { campaignId: "c1", name: "New name" });
    expect(r.json.currentValues.name).toBe("Old name");
    expect(r.json.request).toMatchObject({ method: "PATCH", path: "/admin/v1/campaigns/c1", body: { name: "New name" } });
  });

  it("registers no write tools in read-only mode", async () => {
    const rw = await connect({});
    const ro = await connect({}, { readOnly: true });
    const names = async (c: typeof rw) => (await c.client.listTools()).tools.map((t) => t.name);
    expect(await names(rw)).toContain("decide_leave_request");
    expect(await names(ro)).not.toContain("decide_leave_request");
    expect(await names(ro)).toContain("campaign_overview");
  });

  it("marks writes destructive and reads read-only so hosts prompt correctly", async () => {
    const { client } = await connect({});
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === "correct_sales_record")!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.find((t) => t.name === "get_report")!.annotations).toMatchObject({ readOnlyHint: true });
  });
});

describe("context", () => {
  it("exposes the glossary resource and prompts", async () => {
    const { client } = await connect({});
    const res = await client.readResource({ uri: "campaignbuddy://glossary" });
    expect((res.contents[0] as any).text).toMatch(/Conversion rate = converted \/ approached/);
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(expect.arrayContaining(["daily_briefing", "weekly_performance_review", "attendance_exceptions"]));
  });
});
