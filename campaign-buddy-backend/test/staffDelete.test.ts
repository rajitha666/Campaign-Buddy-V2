import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";

beforeEach(resetDb);

describe("DELETE /admin/v1/staff/:id (#23)", () => {
  it("hard-deletes a staff member with no history", async () => {
    const token = await adminToken();
    const staff = await makeStaff();

    const res = await request(app).delete(`/admin/v1/staff/${staff.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.staff.findUnique({ where: { id: staff.id } })).toBeNull();
  });

  it("soft-deletes (marks inactive) a promoter referenced by an activation, instead of 409 IN_USE", async () => {
    const token = await adminToken();
    const { staff } = await makeCampaignWithActivation(); // staff is assigned to an activation

    const res = await request(app).delete(`/admin/v1/staff/${staff.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);
    expect(res.body.data.status).toBe("inactive");

    const stillThere = await prisma.staff.findUnique({ where: { id: staff.id } });
    expect(stillThere?.status).toBe("inactive");
  });

  it("404s on an unknown staff id (unaffected by the soft-delete fallback)", async () => {
    const token = await adminToken();
    const res = await request(app).delete("/admin/v1/staff/does-not-exist").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
