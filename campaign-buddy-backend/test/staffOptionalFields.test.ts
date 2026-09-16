import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

describe("POST /admin/v1/staff — blank optional fields (#21)", () => {
  it("201s when every optional HR field is submitted as an empty string, storing null not \"\"", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-BLANK", fullName: "Blank Fields", displayName: "Blank", userType: "promoter",
        mobileUsername: "blankfields", password: "pw",
        dateOfBirth: "", nic: "", gender: "", permanentAddress: "", currentAddress: "",
        emergencyContactName: "", emergencyContactPhone: "",
        bankAccountName: "", bankName: "", bankAccountNumber: "", bankBranch: "",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.dateOfBirth).toBeNull();
    expect(res.body.data.nic).toBeNull();
    expect(res.body.data.emergencyContactPhone).toBeNull();
    expect(res.body.data.bankAccountName).toBeNull();
  });

  it("PATCH also accepts a blank dateOfBirth without crashing", async () => {
    const token = await adminToken();
    const created = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-BLANK2", fullName: "B2", displayName: "B2", userType: "promoter",
        mobileUsername: "blankfields2", password: "pw", dateOfBirth: "1990-01-01",
      });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/admin/v1/staff/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateOfBirth: "" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.dateOfBirth).toBeNull();
  });

  // Blank optional *FK* fields — the schema used to reject "" for cityId (et.al.)
  // with a misleading "City id is required" even though pickStaff converts ""
  // to null. Regression: the exact payload reported from the portal.
  it("accepts cityId as an empty string and stores null", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-BLANKCITY", fullName: "Blank City", displayName: "BC", userType: "promoter",
        mobileUsername: "blankcity", password: "pw", cityId: "",
      });
      expect(res.status).toBe(201);
      expect(res.body.data.cityId).toBeNull();
  });

  it("PATCH clears cityId when it is submitted as an empty string", async () => {
    const token = await adminToken();
    const city = await prisma.city.create({ data: { name: "C", province: "P", district: "D" } });
    const created = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-CITYCLR", fullName: "City Clear", displayName: "CC", userType: "promoter",
        mobileUsername: "cityclear", password: "pw", cityId: city.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.cityId).toBe(city.id);

    const patched = await request(app)
      .patch(`/admin/v1/staff/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cityId: "" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.cityId).toBeNull();
  });

  it("a real invalid cityId (non-empty) still reports the FK as not found", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-BADCITY", fullName: "X", displayName: "X", userType: "promoter",
        mobileUsername: "badcity", password: "pw", cityId: "does-not-exist",
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IN_USE");
  });
});

describe("P2003 error message is create/update-aware, not always \"cannot be deleted\" (#21)", () => {
  it("a bad FK on create reports a not-found reference, not a delete-blocked one", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/admin/v1/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employeeId: "EMP-BADFK", fullName: "X", displayName: "X", userType: "promoter",
        mobileUsername: "badfk", password: "pw", cityId: "does-not-exist",
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IN_USE");
    expect(res.body.error.message).not.toMatch(/cannot be deleted/i);
  });
});
