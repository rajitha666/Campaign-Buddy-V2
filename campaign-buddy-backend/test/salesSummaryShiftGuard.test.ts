import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// Issue: a rep who checks out without confirming the summary could never
// confirm that day — POST /sales-summary/today/confirm ran requireOpenShift.

describe("sales summary shift guard", () => {
  it("confirm still succeeds after check-out", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    await request(app).post("/v1/attendance/check-out").set("Authorization", `Bearer ${token}`).send({});

    const res = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.confirmed).toBe(true);
  });

  it("confirm is still blocked before check-in", async () => {
    const { staff } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_CHECKED_IN");
  });

  it("PATCH /sales-summary/today stays block after check-out", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    await request(app).post("/v1/attendance/check-out").set("Authorization", `Bearer ${token}`).send({});

    const res = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ remarks: "late edit" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_CHECKED_IN");
  });
});
