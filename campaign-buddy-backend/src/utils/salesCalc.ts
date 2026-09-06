import { PrismaClient } from "@prisma/client";

// totalSales and the SalesSummary rollup fields are NEVER stored columns (Backend
// Spec v3 §5.2) — always computed live from SalesRecord + Item.unitPrice + DailyStats.

export async function computeTotalSales(prisma: PrismaClient, activationId: string, date: Date): Promise<number> {
  const activationItems = await prisma.activationItem.findMany({
    where: { activationId },
    include: {
      campaignItem: { include: { item: true } },
      salesRecords: { where: { date } },
    },
  });

  let total = 0;
  for (const ai of activationItems) {
    const record = ai.salesRecords[0];
    if (record) {
      total += record.soldToday * ai.campaignItem.item.unitPrice;
    }
  }
  return total;
}

export async function buildSalesSummary(prisma: PrismaClient, activationId: string, date: Date) {
  const activationItems = await prisma.activationItem.findMany({
    where: { activationId },
    include: {
      campaignItem: { include: { item: true } },
      salesRecords: { where: { date } },
    },
  });

  let itemsReceived = 0;
  let itemsSold = 0;
  let totalSales = 0;
  for (const ai of activationItems) {
    const record = ai.salesRecords[0];
    if (record) {
      itemsReceived += record.openingStock;
      itemsSold += record.soldToday;
      totalSales += record.soldToday * ai.campaignItem.item.unitPrice;
    }
  }

  const dailyStats = await prisma.dailyStats.findUnique({
    where: { activationId_date: { activationId, date } },
  });

  const summary = await prisma.salesSummary.findUnique({
    where: { activationId_date: { activationId, date } },
  });

  return {
    itemsReceived,
    itemsSold,
    itemsRemaining: itemsReceived - itemsSold,
    totalSales,
    footFall: dailyStats?.footFall ?? 0,
    approached: dailyStats?.approached ?? 0,
    converted: dailyStats?.converted ?? 0,
    remarks: summary?.remarks ?? null,
    confirmed: summary?.confirmed ?? false,
    confirmedAt: summary?.confirmedAt ?? null,
  };
}
