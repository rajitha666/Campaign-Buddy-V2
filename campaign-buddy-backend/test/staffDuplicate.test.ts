import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken } from "./helpers";

beforeEach(resetDb);

// Repro for the reported "can't add promoter with 0771111111" — a phone
// conflict is a real 409, but a duplicate employeeId / mobileUsername must NOT
// be reported as a phone problem.
describe("POST /admin/v1/staff — duplicate 409 messages", () => {
  const base = {
    fullName: "Dahami Kavya", displayName: "Dahami", userType: "promoter", password: "pw",
  };

  async function create(over: Record<string, unknown>) {
    const token = await adminToken();
    return request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...base, ...over });
  }

  it("duplicate phone still 409s with the phone message", async () => {
    const first = await create({ employeeId: "E-1", mobileUsername: "dahami1", phone: "0771111111" });
    expect(first.status).toBe(201);
    const res = await create({ employeeId: "E-2", mobileUsername: "dahami2", phone: "0771111111" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/phone/i);
  });

  it("duplicate employeeId 409s with an employee-ID message, not the phone message", async () => {
    await create({ employeeId: "E-DUP", mobileUsername: "user_a", phone: "0772222222" });
    const res = await create({ employeeId: "E-DUP", mobileUsername: "user_b", phone: "0773333333" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/employee ID/i);
    expect(res.body.error.message).not.toMatch(/phone/i);
  });

  it("duplicate mobileUsername 409s with an app-username message, not the phone message", async () => {
    await create({ employeeId: "E-3", mobileUsername: "dahami", phone: "0774444444" });
    const res = await create({ employeeId: "E-4", mobileUsername: "dahami", phone: "0775555555" });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/app username/i);
    expect(res.body.error.message).not.toMatch(/phone/i);
  });
});
