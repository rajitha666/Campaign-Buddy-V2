import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { closeOpenShifts } from "../src/jobs/autoCheckout";
import { idealShiftEnd, resolveShiftEnd } from "../src/utils/attendanceWindow";

// Issue #32 — every staff member left checked in at end of day must get a
// check-out recorded automatically. Runs like the other jobs (server.ts only)
// but the work itself is `closeOpenShifts()`, tested here directly against the
// real DB.

beforeEach(resetDb);

describe("closeOpenShifts — auto check-out at end of day (issue #32)", () => {
  it("checks out every open shift, using the campaign's default shift end (18:00 Colombo) as checkOutAt", async () => {
    const { staff, activation, campaign } = await makeCampaignWithActivation();
    const today = new Date(new Date().toISOString().slice(0, 10));
    void staff;
    const open = await prisma.attendanceRecord.create({
      data: { activationId: activation.id, date: today, checkInAt: new Date(today.getTime() + 3.5 * 3600_000) },
    });

    const closed = await closeOpenShifts(new Date(today.getTime() + 20 * 3600_000));
    expect(closed).toBe(1);

    const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: open.id } });
    // activation has no override → campaign's default shift end (18:00 Colombo)
    expect(rec.checkOutAt).toEqual(resolveShiftEnd({ shiftEndMinutes: null }, campaign, today));
    expect(rec.checkOutAt).not.toEqual(idealShiftEnd(today)); // confirms it's the 18:00 default, not the legacy 17:00 fallback
  });

  it("prefers the activation's explicit shiftEndMinutes override over the campaign default", async () => {
    const { staff, activation, campaign } = await makeCampaignWithActivation();
    void staff;
    void campaign;
    const today = new Date(new Date().toISOString().slice(0, 10));
    const shiftEnd = new Date(today.getTime() + 10.5 * 3600_000); // 16:00 Colombo
    await prisma.activation.update({ where: { id: activation.id }, data: { shiftEndMinutes: 960 } }); // 16:00
    await prisma.attendanceRecord.create({
      data: { activationId: activation.id, date: today, checkInAt: new Date(today.getTime() + 3 * 3600_000) },
    });

    await closeOpenShifts(new Date(today.getTime() + 13 * 3600_000));
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { activationId: activation.id } });
    expect(rec.checkOutAt).toEqual(shiftEnd);
  });

  it("never sets checkOutAt in the future and skips already-closed records", async () => {
    const { staff, activation } = await makeCampaignWithActivation();
    const today = new Date(new Date().toISOString().slice(0, 10));
    const shiftEnd = new Date(today.getTime() + 20 * 3600_000); // 01:30 Colombo NEXT day — past the 23:55 job run
    // 01:30 is earlier in the day than the campaign's default 09:00 start, so
    // resolveShiftEnd rolls it over to the following calendar day (see
    // attendanceWindow.ts) — landing exactly on `shiftEnd` above.
    await prisma.activation.update({ where: { id: activation.id }, data: { shiftEndMinutes: 90 } });
    const now = new Date(today.getTime() + 18 * 3600_000); // 23:30 Colombo-ish
    const open = await prisma.attendanceRecord.create({
      data: { activationId: activation.id, date: today, checkInAt: new Date(now.getTime() - 3600_000) },
    });
    const done = await prisma.attendanceRecord.create({
      data: { activationId: activation.id, date: new Date(today.getTime() - 86400_000), checkInAt: new Date(today.getTime() - 12 * 3600_000), checkOutAt: new Date(today.getTime() - 10 * 3600_000) },
    });

    await closeOpenShifts(now);
    const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: open.id } });
    expect(rec.checkOutAt!.getTime()).toBeLessThanOrEqual(now.getTime());

    const untouched = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: done.id } });
    expect(untouched.checkOutAt).toEqual(new Date(today.getTime() - 10 * 3600_000));
  });

  it("closes abandoned open shifts from previous days too", async () => {
    const { staff, activation } = await makeCampaignWithActivation();
    const yesterday = new Date(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
    const open = await prisma.attendanceRecord.create({
      data: { activationId: activation.id, date: yesterday, checkInAt: new Date(yesterday.getTime() + 4 * 3600_000) },
    });

    const closed = await closeOpenShifts();
    expect(closed).toBe(1);
    const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: open.id } });
    expect(rec.checkOutAt).toBeTruthy();
  });

  it("leaves records without a check-in alone", async () => {
    const { staff, activation } = await makeCampaignWithActivation();
    const today = new Date(new Date().toISOString().slice(0, 10));
    await prisma.attendanceRecord.create({ data: { activationId: activation.id, date: today, status: "leave" } });
    expect(await closeOpenShifts()).toBe(0);
  });
});
