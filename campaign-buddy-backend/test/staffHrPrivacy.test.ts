import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeStaff } from "./helpers";

beforeEach(resetDb);

const HR_FIELDS = [
  "nic", "dateOfBirth", "gender", "permanentAddress", "currentAddress",
  "emergencyContactName", "emergencyContactPhone",
  "bankAccountName", "bankName", "bankAccountNumber", "bankBranch",
];

async function tokenFor(roleId: "sponsor" | "supervisor") {
  const username = `hr-${roleId}`;
  await prisma.user.create({ data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId } });
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

async function staffWithHr() {
  return makeStaff({
    fullName: "Hr Person",
    nic: "199012345678", dateOfBirth: new Date("1990-01-01"), gender: "F",
    permanentAddress: "1 Main St", currentAddress: "2 Side St",
    emergencyContactName: "Kin", emergencyContactPhone: "0770000000",
    bankAccountName: "Hr Person", bankName: "Bank", bankAccountNumber: "123456789", bankBranch: "Colombo",
  });
}

describe("staff HR and bank details are admin-only (privacy)", () => {
  for (const role of ["sponsor", "supervisor"] as const) {
    it(`the staff list gives a ${role} names for dropdowns but no HR, bank or ID fields`, async () => {
      const s = await staffWithHr();
      const res = await request(app).get("/admin/v1/staff").query({ pageSize: 100 }).set("Authorization", `Bearer ${await tokenFor(role)}`);
      expect(res.status).toBe(200);
      const row = res.body.data.find((r: any) => r.id === s.id);
      expect(row?.fullName).toBe("Hr Person"); // still usable for dropdowns
      for (const f of HR_FIELDS) expect(row, `${f} leaked to ${role}`).not.toHaveProperty(f);
      expect(JSON.stringify(res.body)).not.toContain("123456789");
    });

    it(`a ${role} cannot open a staff evaluation (it carries the full HR profile)`, async () => {
      const s = await staffWithHr();
      const res = await request(app).get(`/admin/v1/staff/${s.id}/evaluation`).set("Authorization", `Bearer ${await tokenFor(role)}`);
      expect(res.status).toBe(403);
    });
  }

  it("an admin still gets the full row and the evaluation", async () => {
    const s = await staffWithHr();
    const adm = await adminToken();
    const list = await request(app).get("/admin/v1/staff").query({ pageSize: 100 }).set("Authorization", `Bearer ${adm}`);
    expect(list.body.data.find((r: any) => r.id === s.id).nic).toBe("199012345678");
    const ev = await request(app).get(`/admin/v1/staff/${s.id}/evaluation`).set("Authorization", `Bearer ${adm}`);
    expect(ev.status).toBe(200);
    expect(ev.body.data.profile.bankAccountNumber).toBe("123456789");
  });
});

describe("HR fields never ride along inside other responses for non-admins (privacy)", () => {
  it("a supervisor and a sponsor who can open the campaign get activations without the staff member's ID or bank details", async () => {
    const { makeCampaignWithActivation } = await import("./helpers");
    const { campaign, staff } = await makeCampaignWithActivation();
    await prisma.staff.update({ where: { id: staff.id }, data: { nic: "199012345678", bankAccountNumber: "123456789", dateOfBirth: new Date("1990-01-01") } });
    for (const role of ["sponsor", "supervisor"] as const) {
      const token = await tokenFor(role);
      const user = await prisma.user.findFirstOrThrow({ where: { username: `hr-${role}` } });
      await prisma.campaignAccessGrant.create({ data: { userId: user.id, campaignId: campaign.id, scopeType: "all" } });
      const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text, `nic reached ${role}`).not.toContain("199012345678");
      expect(text, `bank account reached ${role}`).not.toContain("123456789");
      expect(text, `dob reached ${role}`).not.toContain("1990-01-01");
    }
  });
});

describe("stripHrFields", () => {
  it("removes HR keys at any depth, keeps everything else, leaves Dates alone", async () => {
    const { stripHrFields } = await import("../src/middleware/hrFieldFilter");
    const d = new Date("2026-01-01");
    const out = stripHrFields({ data: [{ id: 1, nic: "x", staff: { fullName: "A", bankName: "B", at: d, nested: [{ gender: "F", ok: 1 }] } }] });
    expect(out).toEqual({ data: [{ id: 1, staff: { fullName: "A", at: d, nested: [{ ok: 1 }] } }] });
  });
});
