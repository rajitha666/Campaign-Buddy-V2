import { beforeEach, describe, expect, it } from "vitest";
import { colomboYmd } from "../src/utils/dates";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

// Client doc D — "Tester" (how many testers a customer tried) is a standard
// field a campaign toggles on/off, not a hand-configured custom field. Under
// the hood it's still a SalesFieldDefinition (day-scope, number), so the
// Update Sales page and reports pick it up via the existing custom-field path.
describe("Campaign testerFieldEnabled toggle", () => {
  it("turning it on auto-provisions a day-scope number 'Tester' field", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const token = await adminToken();

    const res = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ testerFieldEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.data.testerFieldEnabled).toBe(true);

    const fields = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/sales-fields`)
      .set("Authorization", `Bearer ${token}`);
    expect(fields.body.data).toContainEqual(expect.objectContaining({ key: "tester", label: "Tester", type: "number", scope: "day" }));
  });

  it("turning it off archives the field instead of deleting it, preserving recorded values", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();
    const token = await adminToken();

    await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ testerFieldEnabled: true });
    const today = colomboYmd();
    await request(app).put(`/admin/v1/campaigns/${campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: activation.id, date: today, day: { tester: 5 } });

    const off = await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ testerFieldEnabled: false });
    expect(off.status).toBe(200);

    const activeFields = await request(app).get(`/admin/v1/campaigns/${campaign.id}/sales-fields`).set("Authorization", `Bearer ${token}`);
    expect(activeFields.body.data.find((f: any) => f.key === "tester")).toBeUndefined(); // archived, hidden by default

    const allFields = await request(app).get(`/admin/v1/campaigns/${campaign.id}/sales-fields?includeArchived=1`).set("Authorization", `Bearer ${token}`);
    const tester = allFields.body.data.find((f: any) => f.key === "tester");
    expect(tester.archived).toBe(true);

    const row = await prisma.salesFieldValue.findFirst({ where: { definitionId: tester.id } });
    expect(row?.value).toBe("5"); // historical value untouched
  });

  it("turning it back on un-archives the existing field instead of erroring on a duplicate key", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const token = await adminToken();

    await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ testerFieldEnabled: true });
    await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ testerFieldEnabled: false });
    const reOn = await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ testerFieldEnabled: true });
    expect(reOn.status).toBe(200);

    const fields = await request(app).get(`/admin/v1/campaigns/${campaign.id}/sales-fields`).set("Authorization", `Bearer ${token}`);
    const testerFields = fields.body.data.filter((f: any) => f.key === "tester");
    expect(testerFields).toHaveLength(1); // no duplicate created
  });
});
