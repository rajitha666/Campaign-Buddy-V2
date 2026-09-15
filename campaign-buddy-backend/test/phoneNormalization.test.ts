import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeStaff } from "./helpers";

beforeEach(resetDb);

describe("Phone normalization + uniqueness (#22)", () => {
  it("staff create/update accepts any common SL format and stores the local form", async () => {
    const token = await adminToken();
    for (const [input, expected] of [
      ["+94771234567", "0771234567"],
      ["94762223344", "0762223344"],
      ["713334455", "0713334455"],
      ["0714567890", "0714567890"],
    ] as const) {
      const res = await request(app)
        .post("/admin/v1/staff")
        .set("Authorization", `Bearer ${token}`)
        .send({
          employeeId: `EMP-${input}`, fullName: "T", displayName: "T", userType: "promoter",
          mobileUsername: `mu-${input}`, password: "pw", phone: input,
        });
      expect(res.status, input).toBe(201);
      expect(res.body.data.phone).toBe(expected);
    }
  });

  it("normalizes emergencyContactPhone too, and on PATCH", async () => {
    const token = await adminToken();
    const staff = await makeStaff();
    const res = await request(app)
      .patch(`/admin/v1/staff/${staff.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ emergencyContactPhone: "+94711112222" });
    expect(res.status).toBe(200);
    expect(res.body.data.emergencyContactPhone).toBe("0711112222");
  });

  it("rejects a phone already used by another ACTIVE staff member, on create and on update", async () => {
    const token = await adminToken();
    await makeStaff({ mobileUsername: "holder", phone: "0770000001" });

    const create = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ employeeId: "EMP-X", fullName: "X", displayName: "X", userType: "promoter", mobileUsername: "mu-x", password: "pw", phone: "0770000001" });
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe("DUPLICATE");
    expect(create.body.error.field).toBe("phone");

    const other = await makeStaff({ mobileUsername: "other", phone: "0770000002" });
    const update = await request(app)
      .patch(`/admin/v1/staff/${other.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "0770000001" });
    expect(update.status).toBe(409);
  });

  it("allows the same phone on an inactive staff member alongside an active one", async () => {
    const token = await adminToken();
    await makeStaff({ mobileUsername: "holder2", phone: "0770000003" });

    const res = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-Y", fullName: "Y", displayName: "Y", userType: "promoter",
        mobileUsername: "mu-y", password: "pw", phone: "0770000003", status: "inactive",
      });
    expect(res.status).toBe(201);
  });

  it("normalizes outlet phone/mobile on create and update", async () => {
    const token = await adminToken();
    const city = await prisma.city.create({ data: { name: "C", province: "P", district: "D" } });
    const created = await request(app)
      .post("/admin/v1/outlets")
      .set("Authorization", `Bearer ${token}`)
      .send({ outletNo: "O-1", name: "Outlet 1", cityId: city.id, latitude: 6.9, longitude: 79.9, phone: "+94112223344", mobile: "0771234567" });
    expect(created.status).toBe(201);
    expect(created.body.data.phone).toBe("0112223344");
    expect(created.body.data.mobile).toBe("0771234567");

    const updated = await request(app)
      .patch(`/admin/v1/outlets/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mobile: "+94 77 999 8888" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.mobile).toBe("0779998888");
  });

  it("normalizes client contactNumber on create and update", async () => {
    const token = await adminToken();
    const created = await request(app)
      .post("/admin/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyName: "Co", clientName: "C", contactNumber: "+94771234567" });
    expect(created.status).toBe(201);
    expect(created.body.data.contactNumber).toBe("0771234567");

    const updated = await request(app)
      .patch(`/admin/v1/clients/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ contactNumber: "94770000000" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.contactNumber).toBe("0770000000");
  });
});
