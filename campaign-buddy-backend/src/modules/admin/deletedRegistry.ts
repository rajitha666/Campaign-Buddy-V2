import { prisma } from "../../utils/prisma";

// #113 — one registry entry per soft-deletable entity: how to find the deleted rows (scoped),
// what to call them, which parents block a restore, and which existing restore route undoes it.
// `parents` mirrors the 409 PARENT_DELETED checks in the restore routes, so the list can say
// up front that a Restore would be refused.

type Parent = [string, { deletedAt?: Date | null } | null | undefined];
export type FindCtx = { campaignId?: string; outletIds?: string[]; userId: string; isAdm: boolean; take: number };

export interface DeletedEntity {
  type: string;
  find: (ctx: FindCtx) => Promise<any[]>;
  deletedAt: (row: any) => Date | null;
  label: (row: any) => { label: string; context?: string };
  parents: (row: any) => Parent[];
  restorePath: (row: any) => string;
  campaignId?: (row: any) => string | null;
}

const byDeleted = { deletedAt: "desc" } as const;
const del = (row: any) => row.deletedAt ?? null;
const arch = (row: any) => row.archivedAt ?? null;
const join = (...p: Array<string | null | undefined>) => p.filter(Boolean).join(" · ");

export const DELETED_ENTITIES: Record<string, DeletedEntity> = {
  client: {
    type: "client",
    find: ({ take }) => prisma.client.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take }),
    deletedAt: del,
    label: (r) => ({ label: r.companyName || r.clientName }),
    parents: () => [],
    restorePath: (r) => `/clients/${r.id}/restore`,
  },
  brand: {
    type: "brand",
    find: ({ take }) =>
      prisma.brand.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take, include: { client: true } }),
    deletedAt: del,
    label: (r) => ({ label: r.name, context: r.client?.companyName }),
    parents: (r) => [["client", r.client]],
    restorePath: (r) => `/brands/${r.id}/restore`,
  },
  item: {
    type: "item",
    find: ({ take }) =>
      prisma.item.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take, include: { brand: true } }),
    deletedAt: del,
    label: (r) => ({ label: join(r.name, r.sku), context: r.brand?.name }),
    parents: (r) => [["brand", r.brand]],
    restorePath: (r) => `/items/${r.id}/restore`,
  },
  city: {
    type: "city",
    find: ({ take }) => prisma.city.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take }),
    deletedAt: del,
    label: (r) => ({ label: r.name, context: r.district }),
    parents: () => [],
    restorePath: (r) => `/cities/${r.id}/restore`,
  },
  outlet: {
    type: "outlet",
    find: ({ take }) =>
      prisma.outlet.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take, include: { city: true } }),
    deletedAt: del,
    label: (r) => ({ label: join(r.outletNo, r.name), context: r.city?.name }),
    parents: (r) => [["city", r.city]],
    restorePath: (r) => `/outlets/${r.id}/restore`,
  },
  distributor_point: {
    type: "distributor_point",
    find: ({ take }) =>
      prisma.distributorPoint.findMany({ where: { deletedAt: { not: null } }, orderBy: byDeleted, take, include: { city: true } }),
    deletedAt: del,
    label: (r) => ({ label: r.name, context: r.city?.name }),
    parents: (r) => [["city", r.city]],
    restorePath: (r) => `/distributor-points/${r.id}/restore`,
  },
  staff: {
    type: "staff",
    // Staff has no timestamp, only status: inactive. Time and deleter come from the event trail.
    find: ({ take }) =>
      prisma.staff.findMany({
        where: { status: "inactive" },
        orderBy: { updatedAt: "desc" },
        take,
        select: { id: true, displayName: true, employeeId: true, userType: true, updatedAt: true },
      }),
    deletedAt: () => null,
    label: (r) => ({ label: `${r.displayName} (${r.employeeId})`, context: r.userType }),
    parents: () => [],
    restorePath: (r) => `/staff/${r.id}/reactivate`,
  },
  campaign: {
    type: "campaign",
    find: ({ take, isAdm, userId }) =>
      prisma.campaign.findMany({
        where: { deletedAt: { not: null }, ...(isAdm ? {} : { accessGrants: { some: { userId } } }) },
        orderBy: byDeleted,
        take,
        include: { client: true },
      }),
    deletedAt: del,
    label: (r) => ({ label: join(r.campaignNo, r.name), context: r.client?.companyName }),
    parents: (r) => [["client", r.client]],
    restorePath: (r) => `/campaigns/${r.id}/restore`,
    campaignId: (r) => r.id,
  },
  campaign_item: {
    type: "campaign_item",
    find: ({ campaignId, take }) =>
      prisma.campaignItem.findMany({
        where: { campaignId, deletedAt: { not: null } },
        orderBy: byDeleted,
        take,
        include: { item: true },
      }),
    deletedAt: del,
    label: (r) => ({ label: join(r.item?.name, r.item?.sku), context: "Product in campaign" }),
    parents: (r) => [["product", r.item]],
    restorePath: (r) => `/campaigns/${r.campaignId}/items/${r.id}/restore`,
    campaignId: (r) => r.campaignId,
  },
  activation: {
    type: "activation",
    find: ({ campaignId, outletIds, take }) =>
      prisma.activation.findMany({
        where: { campaignId, deletedAt: { not: null }, ...(outletIds ? { outletId: { in: outletIds } } : {}) },
        orderBy: byDeleted,
        take,
        include: { outlet: true, staff: true, campaign: true },
      }),
    deletedAt: del,
    label: (r) => ({ label: r.name || "Activation", context: join(r.outlet?.name, r.staff?.displayName) }),
    // An inactive promoter is not a deleted parent (see the restore route).
    parents: (r) => [["campaign", r.campaign], ["outlet", r.outlet]],
    restorePath: (r) => `/campaigns/${r.campaignId}/activations/${r.id}/restore`,
    campaignId: (r) => r.campaignId,
  },
  activation_item: {
    type: "activation_item",
    find: ({ campaignId, outletIds, take }) =>
      prisma.activationItem.findMany({
        where: {
          deletedAt: { not: null },
          activation: { campaignId, ...(outletIds ? { outletId: { in: outletIds } } : {}) },
        },
        orderBy: byDeleted,
        take,
        include: { activation: true, campaignItem: { include: { item: true } } },
      }),
    deletedAt: del,
    label: (r) => ({
      label: join(r.campaignItem?.item?.name, r.campaignItem?.item?.sku),
      context: `Product on activation ${r.activation?.name ?? ""}`.trim(),
    }),
    parents: (r) => [["activation", r.activation], ["campaign product", r.campaignItem], ["product", r.campaignItem?.item]],
    restorePath: (r) => `/campaigns/${r.activation.campaignId}/activations/${r.activationId}/items/${r.id}/restore`,
    campaignId: (r) => r.activation?.campaignId ?? null,
  },
  supervisor_route: {
    type: "supervisor_route",
    find: ({ campaignId, outletIds, take }) =>
      prisma.supervisorRoute.findMany({
        where: { campaignId, deletedAt: { not: null }, ...(outletIds ? { outletIds: { hasSome: outletIds } } : {}) },
        orderBy: byDeleted,
        take,
        include: { supervisor: true, campaign: true },
      }),
    deletedAt: del,
    label: (r) => ({
      label: `Route: ${r.supervisor?.displayName ?? "supervisor"}`,
      context: `${String(r.dateFrom).slice(0, 10)} to ${String(r.dateTo).slice(0, 10)}`,
    }),
    parents: (r) => [["campaign", r.campaign]],
    restorePath: (r) => `/campaigns/${r.campaignId}/supervisor-routes/${r.id}/restore`,
    campaignId: (r) => r.campaignId,
  },
  supervisor_task: {
    type: "supervisor_task",
    find: ({ campaignId, take }) =>
      prisma.supervisorTask.findMany({
        where: { campaignId, deletedAt: { not: null } },
        orderBy: byDeleted,
        take,
        include: { campaign: true },
      }),
    deletedAt: del,
    label: (r) => ({ label: join(r.category, r.task) }),
    parents: (r) => [["campaign", r.campaign]],
    restorePath: (r) => `/campaigns/${r.campaignId}/supervisor-tasks/${r.id}/restore`,
    campaignId: (r) => r.campaignId,
  },
  sales_field: {
    type: "sales_field",
    find: ({ campaignId, take }) =>
      prisma.salesFieldDefinition.findMany({
        // the built-in tester field is archived by a campaign setting, not by a delete
        where: { campaignId, archivedAt: { not: null }, NOT: { key: "tester" } },
        orderBy: { archivedAt: "desc" },
        take,
        include: { campaign: true },
      }),
    deletedAt: arch,
    label: (r) => ({ label: r.label, context: "Custom sales field" }),
    parents: (r) => [["campaign", r.campaign]],
    restorePath: (r) => `/campaigns/${r.campaignId}/sales-fields/${r.id}/restore`,
    campaignId: (r) => r.campaignId,
  },
  sales_record: {
    type: "sales_record",
    find: ({ campaignId, outletIds, take }) =>
      prisma.salesRecord.findMany({
        where: {
          archivedAt: { not: null },
          activationItem: { activation: { campaignId, ...(outletIds ? { outletId: { in: outletIds } } : {}) } },
        },
        orderBy: { archivedAt: "desc" },
        take,
        include: { activationItem: { include: { activation: { include: { outlet: true } }, campaignItem: { include: { item: true } } } } },
      }),
    deletedAt: arch,
    label: (r) => ({
      label: `${r.activationItem?.campaignItem?.item?.name ?? "Sales record"} · ${String(r.date).slice(0, 10)}`,
      context: join(r.activationItem?.activation?.outlet?.name, `${r.soldToday} sold`),
    }),
    parents: () => [],
    restorePath: (r) => `/campaigns/${r.activationItem.activation.campaignId}/sales/${r.id}/restore`,
    campaignId: (r) => r.activationItem?.activation?.campaignId ?? null,
  },
};

// Staff, catalog and campaigns are reached without a campaign in the URL; the rest sit under one.
export const GLOBAL_ENTITIES = ["client", "brand", "item", "city", "outlet", "distributor_point", "staff", "campaign"];
export const CAMPAIGN_ENTITIES = [
  "campaign_item", "activation", "activation_item", "supervisor_route", "supervisor_task", "sales_field", "sales_record",
];
