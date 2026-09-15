import { prisma } from "../../utils/prisma";

type TargetForProgress = {
  activationId: string;
  targetItemId: string | null;
  targetBrandId: string | null;
  targetValue: number;
  dateFrom: Date;
  dateTo: Date;
};

// Item Wise: sum sales for the one targeted item. Brand Wise: sum sales
// across every item of the targeted brand that's on this activation — the
// brand target is met by combined brand sales, not any single SKU (#24).
export async function computeTargetProgress(target: TargetForProgress, targetUnit: "unit_wise" | "sales_wise") {
  const activationItems = await prisma.activationItem.findMany({
    where: {
      activationId: target.activationId,
      campaignItem: target.targetBrandId
        ? { item: { brandId: target.targetBrandId } }
        : { itemId: target.targetItemId! },
    },
    include: {
      campaignItem: { include: { item: true } },
      salesRecords: { where: { date: { gte: target.dateFrom, lte: target.dateTo } } },
    },
  });

  let achieved = 0;
  for (const activationItem of activationItems) {
    const unitPrice = activationItem.campaignItem.item.unitPrice;
    for (const record of activationItem.salesRecords) {
      achieved += targetUnit === "sales_wise" ? record.soldToday * unitPrice : record.soldToday;
    }
  }

  const percent = target.targetValue > 0 ? Math.round((achieved / target.targetValue) * 1000) / 10 : 0;
  return { achieved, percent };
}
