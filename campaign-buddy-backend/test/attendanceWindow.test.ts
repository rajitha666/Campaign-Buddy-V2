import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { resetDb, staffToken, makeCampaignWithActivation } from "./helpers";
import {
  idealShiftStart,
  idealShiftEnd,
  resolveShiftStart,
  resolveShiftEnd,
  checkInStatus,
  IDEAL_CHECK_IN_HOUR,
  IDEAL_CHECK_OUT_HOUR,
} from "../src/utils/attendanceWindow";

// Issue #31, extended by the per-campaign shift window enhancement: every
// Campaign now carries its own default shift window (default 09:00-18:00,
// admin-editable), and an Activation can still override it. The hardcoded
// 09:00-17:00 "ideal" window only remains as a last-resort fallback.

beforeEach(resetDb);

describe("ideal 09:00–17:00 fallback window", () => {
  it("computes 09:00 and 17:00 Colombo wall time for a @db.Date day key", () => {
    const day = new Date("2026-09-16T00:00:00.000Z");
    expect(IDEAL_CHECK_IN_HOUR).toBe(9);
    expect(IDEAL_CHECK_OUT_HOUR).toBe(17);
    expect(idealShiftStart(day)).toEqual(new Date("2026-09-16T03:30:00.000Z")); // 09:00 +05:30
    expect(idealShiftEnd(day)).toEqual(new Date("2026-09-16T11:30:00.000Z")); // 17:00 +05:30
  });

  it("checkInStatus applies the 10-minute grace period", () => {
    const start = new Date("2026-09-16T03:30:00.000Z");
    expect(checkInStatus(start, new Date("2026-09-16T03:38:00.000Z"))).toBe("on_time");
    expect(checkInStatus(start, new Date("2026-09-16T03:40:00.000Z"))).toBe("on_time"); // exactly +10m is on time
    expect(checkInStatus(start, new Date("2026-09-16T03:41:00.000Z"))).toBe("late");
  });
});

describe("resolveShiftStart/resolveShiftEnd — campaign default + activation override", () => {
  const day = new Date("2026-09-16T00:00:00.000Z");

  it("uses the campaign's default shift window when the activation has no override", () => {
    const activation = { shiftStartMinutes: null, shiftEndMinutes: null };
    const campaign = { shiftStartMinutes: 480, shiftEndMinutes: 1050 }; // 08:00-17:30
    expect(resolveShiftStart(activation, campaign, day)).toEqual(new Date("2026-09-16T02:30:00.000Z"));
    expect(resolveShiftEnd(activation, campaign, day)).toEqual(new Date("2026-09-16T12:00:00.000Z"));
  });

  it("prefers the activation's own override over the campaign default", () => {
    const activation = { shiftStartMinutes: 600, shiftEndMinutes: 960 }; // 10:00-16:00
    const campaign = { shiftStartMinutes: 540, shiftEndMinutes: 1080 }; // 09:00-18:00
    expect(resolveShiftStart(activation, campaign, day)).toEqual(new Date("2026-09-16T04:30:00.000Z"));
    expect(resolveShiftEnd(activation, campaign, day)).toEqual(new Date("2026-09-16T10:30:00.000Z"));
  });

  it("falls back to the hardcoded ideal window when there is no campaign at all", () => {
    const activation = { shiftStartMinutes: null, shiftEndMinutes: null };
    expect(resolveShiftStart(activation, null, day)).toEqual(idealShiftStart(day));
    expect(resolveShiftEnd(activation, undefined, day)).toEqual(idealShiftEnd(day));
  });

  it("rolls an overnight shift's end over to the next calendar day", () => {
    // 22:00-06:00: the end (06:00) is earlier in the day than the start
    // (22:00), so it must resolve to 06:00 the FOLLOWING day, not 06:00
    // earlier the same day.
    const activation = { shiftStartMinutes: 22 * 60, shiftEndMinutes: 6 * 60 };
    const start = resolveShiftStart(activation, null, day);
    const end = resolveShiftEnd(activation, null, day);
    expect(end.getTime() - start.getTime()).toBe(8 * 3600_000);
  });
});

describe("check-in flagging uses the campaign's default shift window (09:00-18:00)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is late after 09:10 Colombo with no activation-level override", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T07:00:00.000Z")); // 12:30 Colombo — past 09:10
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("late");
  });

  it("is on_time before the 09:00 window with no activation-level override", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T02:00:00.000Z")); // 07:30 Colombo
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("on_time");
  });

  it("respects a campaign-level shift override (e.g. 07:00 start)", async () => {
    const { staff, outlet, campaign } = await makeCampaignWithActivation();
    const { prisma } = await import("../src/utils/prisma");
    await prisma.campaign.update({ where: { id: campaign.id }, data: { shiftStartMinutes: 420 } }); // 07:00
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T02:15:00.000Z")); // 07:45 Colombo — past 07:10
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("late");
  });

  it("an activation-level override wins over the campaign's shift", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const { prisma } = await import("../src/utils/prisma");
    // Campaign stays at the 09:00 default; this one activation starts at 06:00.
    await prisma.activation.update({ where: { id: activation.id }, data: { shiftStartMinutes: 360 } });
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T01:00:00.000Z")); // 06:30 Colombo — past 06:10, but well before 09:00
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("late");
  });
});
