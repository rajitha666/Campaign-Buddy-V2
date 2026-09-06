import { z } from "zod";

// Shared building blocks -----------------------------------------------------
const id = z.string().min(1);
const dateish = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "must be a YYYY-MM-DD or ISO date");
const nonNegInt = z.number().int().min(0);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const s = {
  // ---- Auth (both spaces) ----
  login: z.object({ username: z.string().min(1), password: z.string().min(1) }),
  forgotPassword: z.object({ username: z.string().min(1) }).partial(),
  refresh: z.object({ refreshToken: z.string().min(1) }),

  // ---- Mobile ----
  checkIn: z.object({
    assignmentId: id.optional(),
    latitude: lat,
    longitude: lng,
    timestamp: z.string().optional(),
  }),
  checkOut: z.object({
    latitude: lat.optional(),
    longitude: lng.optional(),
    timestamp: z.string().optional(),
    salesSummaryConfirmed: z.boolean().optional(),
  }),
  locationPing: z.object({
    latitude: lat,
    longitude: lng,
    accuracyMeters: z.number().optional(),
    capturedAt: z.string().optional(),
    timestamp: z.string().optional(),
    appState: z.enum(["foreground", "background"]).optional(),
    batteryPercent: z.number().int().min(0).max(100).optional(),
  }),
  statsUpdate: z
    .object({ footFall: nonNegInt, approached: nonNegInt, converted: nonNegInt })
    .partial(),
  stockUpdate: z
    .object({
      openingStock: nonNegInt,
      soldToday: nonNegInt,
      otherInterestedCustomers: nonNegInt,
      reorderFlag: z.boolean(),
    })
    .partial(),
  salesSummaryRemarks: z.object({ remarks: z.string().optional() }),
  salesSummaryConfirm: z.object({ remarks: z.string().optional() }).partial(),
  timeOffCreate: z.object({
    fromDate: dateish,
    toDate: dateish,
    reason: z.enum(["sick_leave", "annual_leave", "personal", "other"]),
    note: z.string().optional(),
  }),

  // ---- Admin: catalog ----
  clientCreate: z.object({
    companyName: z.string().min(1),
    clientName: z.string().min(1),
    contactNumber: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  clientUpdate: z
    .object({
      companyName: z.string().min(1),
      clientName: z.string().min(1),
      contactNumber: z.string(),
      email: z.string(),
      address: z.string(),
    })
    .partial(),
  brandCreate: z.object({ name: z.string().min(1), clientId: id }),
  brandUpdate: z.object({ name: z.string().min(1), clientId: id }).partial(),
  itemCreate: z.object({
    brandId: id,
    sku: z.string().min(1),
    name: z.string().min(1),
    unitPrice: z.number().int(),
    reorderLevel: z.number().int().optional(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    supplierName: z.string().optional(),
    attributes: z.array(z.string()).optional(),
  }),
  itemUpdate: z
    .object({
      brandId: id,
      sku: z.string().min(1),
      name: z.string().min(1),
      unitPrice: z.number().int(),
      reorderLevel: z.number().int(),
      description: z.string(),
    })
    .partial(),
  cityCreate: z.object({
    name: z.string().min(1),
    province: z.string().min(1),
    district: z.string().min(1),
  }),
  cityUpdate: z
    .object({ name: z.string().min(1), province: z.string().min(1), district: z.string().min(1) })
    .partial(),
  outletCreate: z.object({
    outletNo: z.string().min(1),
    name: z.string().min(1),
    cityId: id,
    latitude: lat,
    longitude: lng,
    contactPerson: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    fax: z.string().optional(),
    geofenceRadiusMeters: z.number().int().positive().optional(),
  }),
  outletUpdate: z
    .object({
      outletNo: z.string().min(1),
      name: z.string().min(1),
      cityId: id,
      latitude: lat,
      longitude: lng,
      contactPerson: z.string(),
      address: z.string(),
      phone: z.string(),
      mobile: z.string(),
      fax: z.string(),
      geofenceRadiusMeters: z.number().int().positive(),
    })
    .partial(),
  distributorCreate: z.object({
    name: z.string().min(1),
    cityId: id,
    clientId: id,
    contact: z.string().optional(),
    address: z.string().optional(),
  }),
  distributorUpdate: z
    .object({ name: z.string().min(1), cityId: id, clientId: id, contact: z.string(), address: z.string() })
    .partial(),

  // ---- Admin: campaigns / activations ----
  campaignCreate: z.object({
    campaignNo: z.string().min(1),
    name: z.string().min(1),
    clientId: id,
    startDate: dateish,
    endDate: dateish,
    description: z.string().optional(),
    timezone: z.string().optional(),
  }),
  campaignUpdate: z
    .object({
      campaignNo: z.string().min(1),
      name: z.string().min(1),
      clientId: id,
      startDate: dateish,
      endDate: dateish,
      description: z.string(),
      status: z.enum(["upcoming", "active", "ended"]),
      timezone: z.string(),
    })
    .partial(),
  campaignItemAdd: z
    .object({ itemId: id.optional(), newItem: z.record(z.string(), z.unknown()).optional() })
    .refine((v) => v.itemId || v.newItem, { message: "itemId or newItem required" }),
  activationCreate: z.object({
    name: z.string().min(1),
    outletId: id,
    staffId: id,
    dateFrom: dateish,
    dateTo: dateish,
    supervisorStaffId: id.nullish(),
    distributorPointId: id.nullish(),
    targetType: z.enum(["item_wise", "brand_wise"]).optional(),
    targetCategorization: z.enum(["daily", "monthly"]).optional(),
    targetUnit: z.enum(["unit_wise", "sales_wise"]).optional(),
    shiftStart: z.string().nullish(),
    shiftEnd: z.string().nullish(),
  }),
  activationUpdate: z
    .object({
      name: z.string().min(1),
      outletId: id,
      staffId: id,
      dateFrom: dateish,
      dateTo: dateish,
      supervisorStaffId: id.nullable(),
      distributorPointId: id.nullable(),
      targetType: z.enum(["item_wise", "brand_wise"]),
      targetCategorization: z.enum(["daily", "monthly"]),
      targetUnit: z.enum(["unit_wise", "sales_wise"]),
      shiftStart: z.string().nullable(),
      shiftEnd: z.string().nullable(),
    })
    .partial(),
  activationItemsAdd: z
    .object({
      campaignItemId: id.optional(),
      campaignItemIds: z.array(id).optional(),
      addAll: z.boolean().optional(),
    })
    .refine((v) => v.campaignItemId || v.campaignItemIds || v.addAll, {
      message: "campaignItemId, campaignItemIds or addAll required",
    }),
  targetCreate: z.object({
    dateFrom: dateish,
    dateTo: dateish,
    targetItemId: id,
    targetValue: z.number().int(),
    repeat: z.boolean().optional(),
  }),

  // ---- Admin: operations ----
  salesCorrect: z
    .object({
      openingStock: nonNegInt,
      soldToday: nonNegInt,
      otherInterestedCustomers: nonNegInt,
      reorderFlag: z.boolean(),
    })
    .partial(),
  leaveDecide: z.object({ status: z.enum(["approved", "declined"]) }),
  supervisorRouteCreate: z.object({
    supervisorStaffId: id,
    outletIds: z.array(id).min(1),
    dateFrom: dateish,
    dateTo: dateish,
  }),
  supervisorRouteUpdate: z
    .object({
      supervisorStaffId: id,
      outletIds: z.array(id).min(1),
      dateFrom: dateish,
      dateTo: dateish,
    })
    .partial(),
  supervisorTaskCreate: z.object({
    category: z.string().min(1),
    task: z.string().min(1),
    taskType: z.enum(["range", "feedback"]).optional(),
  }),
  supervisorTaskUpdate: z
    .object({
      category: z.string().min(1),
      task: z.string().min(1),
      taskType: z.enum(["range", "feedback"]),
    })
    .partial(),

  // ---- Admin: staff / RBAC ----
  staffCreate: z.object({
    employeeId: z.string().min(1),
    fullName: z.string().min(1),
    displayName: z.string().min(1),
    userType: z.enum(["promoter", "supervisor"]),
    mobileUsername: z.string().min(1),
    password: z.string().min(1),
    status: z.enum(["active", "inactive"]).optional(),
    phone: z.string().optional(),
    cityId: id.optional(),
    reportsToStaffId: id.optional(),
    linkedUserId: id.optional(),
    nic: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    permanentAddress: z.string().optional(),
    currentAddress: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    bankAccountName: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranch: z.string().optional(),
  }),
  staffUpdate: z.record(z.string(), z.unknown()), // whitelisted in the handler
  userCreate: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    displayName: z.string().min(1),
    roleId: id,
    email: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
  userUpdate: z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
      displayName: z.string().min(1),
      roleId: id,
      email: z.string(),
      isActive: z.boolean(),
    })
    .partial(),
  campaignAccessGrant: z
    .object({
      campaignId: id,
      scopeType: z.enum(["all", "subset"]),
      outletIds: z.array(id).optional(),
    })
    .refine((v) => v.scopeType !== "subset" || (v.outletIds && v.outletIds.length > 0), {
      message: "outletIds is required when scopeType is 'subset'",
      path: ["outletIds"],
    }),
  roleCreate: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    defaultUrl: z.string().min(1),
    description: z.string().optional(),
    modules: z.array(z.string()).optional(),
    functionality: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
  roleUpdate: z
    .object({
      label: z.string().min(1),
      defaultUrl: z.string().min(1),
      description: z.string(),
      modules: z.array(z.string()),
      functionality: z.array(z.string()),
      isActive: z.boolean(),
    })
    .partial(),
};
