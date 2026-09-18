import { prisma } from "./prisma";
import { dayDate } from "./dates";

// The mobile app always operates on "today" and the staff member's one active
// assignment. Must match the UTC-midnight date convention every other mobile
// route uses (dayDate() — see utils/dates.ts), so custom-field rows co-locate
// with the SalesRecord / DailyStats / SalesSummary rows for the day.
//
// This used to compute LOCAL midnight via setHours(0,0,0,0), which lands on
// the previous UTC calendar day for any positive-offset timezone (e.g.
// Asia/Colombo, UTC+5:30) — GET /sales-fields was reading yesterday's custom
// field values back as "today's", while every write (PATCH /sales-summary/
// today, which uses dayDate()) correctly wrote to today. Delegating to
// dayDate() fixes the mismatch.
export function mobileToday(): Date {
  return dayDate();
}

export function currentActivationForStaff(staffId: string) {
  const today = mobileToday();
  return prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
}
