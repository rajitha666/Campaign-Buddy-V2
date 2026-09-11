import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { resetCiStatusCache } from "../src/utils/githubActions";

beforeEach(async () => {
  await resetDb();
  resetCiStatusCache();
});

const GH_ENV = ["GITHUB_TOKEN", "GITHUB_ISSUES_REPO"] as const;
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of GH_ENV) delete process.env[k];
});

function enableGitHub() {
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

describe("GET /admin/v1/system/status", () => {
  it("rejects a supervisor persona with 403", async () => {
    const token = await portalUserToken("sup_a", "supervisor");
    const res = await request(app)
      .get("/admin/v1/system/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects a Campaign Admin (usr) with 403 — Super Admin only, like /users and /roles", async () => {
    const token = await portalUserToken("campaign_admin", "usr");
    const res = await request(app)
      .get("/admin/v1/system/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("reports not configured when GITHUB_TOKEN / GITHUB_ISSUES_REPO are unset", async () => {
    const token = await adminToken();
    const res = await request(app)
      .get("/admin/v1/system/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.backendVersion).toBeTruthy();
    expect(res.body.data.ci).toMatchObject({ configured: false, error: null, run: null });
  });

  it("returns the latest run's per-job status when configured", async () => {
    enableGitHub();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/actions/workflows/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 123,
                  status: "completed",
                  conclusion: "success",
                  html_url: "https://github.com/acme/widgets/actions/runs/123",
                  head_sha: "abcdef1234567890",
                  head_commit: { message: "ci: add pipeline\n\nlonger body" },
                  created_at: "2026-09-11T10:00:00Z",
                  updated_at: "2026-09-11T10:05:00Z",
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            jobs: [
              {
                name: "backend",
                status: "completed",
                conclusion: "success",
                started_at: "2026-09-11T10:00:00Z",
                completed_at: "2026-09-11T10:04:00Z",
                html_url: "https://github.com/acme/widgets/actions/runs/123/jobs/1",
              },
              {
                name: "portal-e2e",
                status: "completed",
                conclusion: "failure",
                started_at: "2026-09-11T10:00:00Z",
                completed_at: "2026-09-11T10:05:00Z",
                html_url: "https://github.com/acme/widgets/actions/runs/123/jobs/2",
              },
            ],
          }),
          { status: 200 }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await adminToken();
    const res = await request(app)
      .get("/admin/v1/system/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ci.configured).toBe(true);
    expect(res.body.data.ci.error).toBeNull();
    expect(res.body.data.ci.run).toMatchObject({
      runId: 123,
      conclusion: "success",
      headSha: "abcdef1234567890",
      headCommitMessage: "ci: add pipeline",
    });
    expect(res.body.data.ci.run.jobs).toEqual([
      expect.objectContaining({ name: "backend", conclusion: "success" }),
      expect.objectContaining({ name: "portal-e2e", conclusion: "failure" }),
    ]);
  });

  it("surfaces a GitHub API error without failing the request", async () => {
    enableGitHub();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }))
    );

    const token = await adminToken();
    const res = await request(app)
      .get("/admin/v1/system/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ci.configured).toBe(true);
    expect(res.body.data.ci.run).toBeNull();
    expect(res.body.data.ci.error).toContain("401");
  });
});
