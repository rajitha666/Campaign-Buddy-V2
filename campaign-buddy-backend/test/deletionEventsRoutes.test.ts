import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import adminRouter from "../src/modules/admin";
import { classifyRequest } from "../src/middleware/deletionEvents";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeStaff } from "./helpers";

beforeEach(resetDb);

// Walk the real admin router and collect every route registered with the given predicate.
function collect(router: any, prefix = ""): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
    } else if (layer.handle?.stack) {
      out.push(...collect(layer.handle, prefix));
    }
  }
  return out;
}

// Deletes of things that are not soft-deleted entities: access grants (hard delete, audit story #138),
// the mobile-side photo delete, personalization, etc. Anything NEW that is a DELETE or a restore/
// reactivate must either be classified by recordDeletionEvents or be added here on purpose.
const NOT_ENTITIES = new Set([
  "DELETE /campaigns/:campaignId/admins/:userId",
  "POST /campaigns/:campaignId/admins/:userId/restore",
  "DELETE /users/:id/campaign-access/:campaignId",
]);

describe("deletion-event middleware covers every delete / restore route (#113)", () => {
  const routes = collect(adminRouter);
  const candidates = routes.filter(
    (r) => r.method === "DELETE" || (r.method === "POST" && /\/(restore|reactivate)$/.test(r.path))
  );

  it("finds the routes it is meant to guard", () => {
    expect(candidates.length).toBeGreaterThan(20);
  });

  it.each(candidates.map((r) => [`${r.method} ${r.path}`, r] as const))("%s is classified (or deliberately excluded)", (key, r) => {
    const concrete = r.path.replace(/:[A-Za-z]+/g, "some-id");
    const hit = classifyRequest(r.method, concrete);
    if (NOT_ENTITIES.has(key)) {
      expect(hit, `${key} is listed as not-an-entity but is now classified`).toBeNull();
    } else {
      expect(hit, `${key} deletes/restores something but recordDeletionEvents does not know it — add a rule or list it in NOT_ENTITIES`).not.toBeNull();
    }
  });

  it("is case-insensitive, strips a trailing slash and survives a malformed %-escape", () => {
    expect(classifyRequest("DELETE", "/Clients/abc/")?.entityType).toBe("client");
    expect(classifyRequest("DELETE", "/clients/%E0%A4%A")).toBeNull(); // would throw in decodeURIComponent
    expect(classifyRequest("GET", "/clients/abc")).toBeNull();
  });
});

describe("recording behaviour (#113)", () => {
  it("deleting an already-inactive staff member again does not overwrite who/when", async () => {
    const h = { Authorization: `Bearer ${await adminToken()}` };
    const staff = await makeStaff();
    await request(app).delete(`/admin/v1/staff/${staff.id}`).set(h).expect(200);
    await waitFor(async () => (await prisma.deletionEvent.count()) === 1);
    await request(app).delete(`/admin/v1/staff/${staff.id}`).set(h).expect(200); // idempotent route
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.deletionEvent.count()).toBe(1);
  });
});

async function waitFor(cond: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("condition not met in time");
}
