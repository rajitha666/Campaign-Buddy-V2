import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { resetDb, staffToken, makeCampaignWithActivation } from "./helpers";
import { idealShiftStart, idealShiftEnd, checkInStatus, IDEAL_CHECK_IN_HOUR, IDEAL_CHECK_OUT_HOUR } from "../src/utils/attendanceWindow";

// Issue #31 — the standard (ideal) shift window is 09:00–17:00 local
// (Asia/Colombo, the only campaign timezone in practice). When an Activation
// has no explicit shiftStart/shiftEnd, late/on-time flagging should fall back
// to this window instead of missing enforcement entirely.

beforeEach(resetDb);

describe("ideal 09:00–17:00 shift window", () => {
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

describe("check-in falls back to the ideal window when the activation has no shiftStart", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is late after 09:10 Colombo with no configured shift", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T07:00:00.000Z")); // 12:30 Colombo — past 09:10
    await prismaUpdateActivationNoShift(staff.id);
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("late");
  });

  it("is on_time before the 09:00 window with no configured shift", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T02:00:00.000Z")); // 07:30 Colombo
    await prismaUpdateActivationNoShift(staff.id);
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("on_time");
  });
});

async function prismaUpdateActivationNoShift(staffId: string) {
  const { prisma } = await import("../src/utils/prisma");
  await prisma.activation.updateMany({ where: { staffId }, data: { shiftStart: null, shiftEnd: null } });
}
