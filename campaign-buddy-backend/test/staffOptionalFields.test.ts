import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken } from "./helpers";

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
