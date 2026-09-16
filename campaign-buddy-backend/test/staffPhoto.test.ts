import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { resetDb, adminToken, staffToken, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" + "01f15c4890000000a49444154789c6300010000050001" + "0d0a2db4",
  "hex"
);

// Issue #29 — staff profile pictures: upload/serve via the API, expose on the
// expose points where staff are referenced (staff list, evaluation profile,
// mobile /v1/me). Staff can also upload their own photo from the app (#18).

describe("staff profile picture", () => {
  it("uploads via POST /admin/v1/staff/:id/photo and returns the stored URL", async () => {
    const staff = await makeStaff();
    const res = await request(app)
      .post(`/admin/v1/staff/${staff.id}/photo`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .attach("image", PNG, { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.data.profilePictureUrl).toMatch(/^\/uploads\/staff\//);

    const inDb = await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } });
    expect(inDb.profilePictureUrl).toBe(res.body.data.profilePictureUrl);
  });

  it("rejects non-image uploads", async () => {
    const staff = await makeStaff();
    const res = await request(app)
      .post(`/admin/v1/staff/${staff.id}/photo`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .attach("image", Buffer.from("hello"), { filename: "note.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("rejects upload without the image field and requires an admin portal role", async () => {
    const staff = await makeStaff();
    const noFile = await request(app)
      .post(`/admin/v1/staff/${staff.id}/photo`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(noFile.status).toBe(400);

    const mobile = await request(app)
      .post(`/admin/v1/staff/${staff.id}/photo`)
      .set("Authorization", `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}`)
      .attach("image", PNG, { filename: "photo.png", contentType: "image/png" });
    // A mobile staff token is not a portal session at all (auth middleware
    // differs), so 401 or 403 are both correct rejections.
    expect([401, 403]).toContain(mobile.status);
  });

  it("exposes profilePictureUrl in the staff list, evaluation profile and /v1/me", async () => {
    const staff = await makeStaff();
    await prisma.staff.update({ where: { id: staff.id }, data: { profilePictureUrl: "/uploads/staff/x.png" } });

    const list = await request(app).get("/admin/v1/staff").set("Authorization", `Bearer ${await adminToken()}`);
    const row = list.body.data.find((r: { id: string }) => r.id === staff.id);
    expect(row.profilePictureUrl).toBe("/uploads/staff/x.png");

    const evalRes = await request(app).get(`/admin/v1/staff/${staff.id}/evaluation`).set("Authorization", `Bearer ${await adminToken()}`);
    expect(evalRes.body.data.profile.profilePictureUrl).toBe("/uploads/staff/x.png");

    const me = await request(app).get("/v1/me").set("Authorization", `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}`);
    expect(me.body.data.profilePictureUrl).toBe("/uploads/staff/x.png");
  });

  it("lets a staff member upload their OWN photo from the app (POST /v1/me/photo)", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const res = await request(app)
      .post("/v1/me/photo")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", PNG, { filename: "selfie.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.data.profilePictureUrl).toMatch(/^\/uploads\/staff\//);
    const inDb = await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } });
    expect(inDb.profilePictureUrl).toBe(res.body.data.profilePictureUrl);
  });
});
