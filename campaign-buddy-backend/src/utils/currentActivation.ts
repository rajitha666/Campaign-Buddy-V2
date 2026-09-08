import { prisma } from "./prisma";

// The mobile app always operates on "today" and the staff member's one active
// assignment. These match the date convention the existing mobile stock / stats
// / sales-summary routes already use (local start-of-day), so custom-field rows
// co-locate with the SalesRecord / DailyStats / SalesSummary rows for the day.

export function mobileToday(): Date {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  return x;
}

export function currentActivationForStaff(staffId: string) {
  const today = mobileToday();
  return prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
}
