import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";
import { mobileToday } from "../src/utils/currentActivation";
import { app, resetDb, staffToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

describe("mobileToday (#custom-field-day-mismatch)", () => {
  it("matches dayDate()'s UTC-midnight convention exactly", () => {
    expect(mobileToday().getTime()).toBe(dayDate().getTime());
  });
});

describe("GET /v1/sales-fields — reads back what was just written for today", () => {
  it("returns the value PATCH /sales-summary/today just wrote, not a stale one from a different day", async () => {
    const { campaign, activation, outlet, staff } = await makeCampaignWithActivation();
    await prisma.salesFieldDefinition.create({
      data: { campaignId: campaign.id, key: "tester", label: "Tester", type: "number", scope: "day", required: false },
    });
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({
      latitude: outlet.latitude,
      longitude: outlet.longitude,
    });

    // A stale value from a neighboring day must never leak into "today"'s read.
    const definition = await prisma.salesFieldDefinition.findFirstOrThrow({ where: { campaignId: campaign.id, key: "tester" } });
    const yesterday = new Date(dayDate().getTime() - 86_400_000);
    await prisma.salesFieldValue.create({
      data: { definitionId: definition.id, activationId: activation.id, date: yesterday, value: "999" },
    });

    const patchRes = await request(app)
      .patch("/v1/sales-summary/today")
      .set("Authorization", `Bearer ${token}`)
      .send({ customFields: { tester: 4 } });
    expect(patchRes.status).toBe(200);

    const fieldsRes = await request(app).get("/v1/sales-fields").set("Authorization", `Bearer ${token}`);
    expect(fieldsRes.status).toBe(200);
    const tester = fieldsRes.body.data.day.find((f: { key: string }) => f.key === "tester");
    expect(tester.value).toBe(4);
  });
});
