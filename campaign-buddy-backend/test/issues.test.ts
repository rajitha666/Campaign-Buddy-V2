import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { retryPendingIssueReports } from "../src/jobs/issueSync";

beforeEach(resetDb);

const GH_ENV = ["GITHUB_ISSUES_ENABLED", "GITHUB_TOKEN", "GITHUB_ISSUES_REPO"] as const;
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of GH_ENV) delete process.env[k];
});

function enableGitHub() {
  process.env.GITHUB_ISSUES_ENABLED = "1";
  process.env.GITHUB_TOKEN = "ghp_test";
  process.env.GITHUB_ISSUES_REPO = "acme/widgets";
}

async function portalUserToken(username: string, roleId: string) {
  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId },
  });
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

const VALID = {
  title: "Live map fails to load",
  body: "Opening Seller Live Locations shows a blank panel and a console 500.",
  category: "bug" as const,
  severity: "high" as const,
  context: { page: "/tracking/live", persona: "admin" },
};

describe("POST /admin/v1/issue-reports", () => {
  it("persists a report and returns it (pending while GitHub is off)", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: VALID.title,
      category: "bug",
      severity: "high",
      syncStatus: "pending",
      reporterName: "Super Admin",
      githubIssueUrl: null,
    });

    const row = await prisma.issueReport.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.reporterUserId).toBeTruthy();
    expect(row.context).toEqual(VALID.context);
  });

  it("defaults severity to normal for a bug, null for other categories", async () => {
    const token = await adminToken();
    const bug = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Something broke here", body: "ten chars minimum here", category: "bug" });
    expect(bug.body.data.severity).toBe("normal");

    const idea = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Add CSV export please", body: "would love a CSV export button", category: "enhancement" });
    expect(idea.body.data.severity).toBeNull();
  });

  it("rejects a supervisor persona with 403", async () => {
    const token = await portalUserToken("sup_a", "supervisor");
    const res = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID);
    expect(res.status).toBe(403);
    expect(await prisma.issueReport.count()).toBe(0);
  });

  it("validates the body (400 on a too-short title)", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID, title: "hi" });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("title");
  });

  it("pushes to GitHub inline when configured", async () => {
    enableGitHub();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ number: 42, html_url: "https://github.com/acme/widgets/issues/42" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      syncStatus: "synced",
      githubIssueNumber: 42,
      githubIssueUrl: "https://github.com/acme/widgets/issues/42",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/acme/widgets/issues");
    const sent = JSON.parse(init.body);
    expect(sent.title).toBe("[portal] Live map fails to load");
    expect(sent.labels).toEqual(expect.arrayContaining(["portal", "from-portal", "bug"]));
    expect(sent.body).toContain("Super Admin");
    expect(sent.body).toContain("/tracking/live");
  });

  it("records the failure but keeps the report when GitHub errors", async () => {
    enableGitHub();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }))
    );

    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.data.syncStatus).toBe("failed");
    expect(res.body.data.syncError).toContain("401");
    expect(res.body.data.syncAttempts).toBe(1);
  });
});

describe("GET /admin/v1/issue-reports", () => {
  it("lists newest first with integration status in meta", async () => {
    const token = await adminToken();
    await request(app).post("/admin/v1/issue-reports").set("Authorization", `Bearer ${token}`).send(VALID);
    await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...VALID, title: "Second report here" });

    const res = await request(app).get("/admin/v1/issue-reports").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe("Second report here");
    expect(res.body.meta.integration).toMatchObject({ enabled: false, configured: false });
  });
});

describe("POST /admin/v1/issue-reports/:id/retry and the sync job", () => {
  it("flushes queued reports once GitHub is configured", async () => {
    const token = await adminToken();
    const created = await request(app)
      .post("/admin/v1/issue-reports")
      .set("Authorization", `Bearer ${token}`)
      .send(VALID);
    expect(created.body.data.syncStatus).toBe("pending");

    enableGitHub();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ number: 7, html_url: "https://github.com/acme/widgets/issues/7" }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const n = await retryPendingIssueReports();
    expect(n).toBe(1);

    const row = await prisma.issueReport.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(row.syncStatus).toBe("synced");
    expect(row.githubIssueNumber).toBe(7);
  });

  it("retry endpoint 404s for an unknown id", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/issue-reports/nope/retry")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
