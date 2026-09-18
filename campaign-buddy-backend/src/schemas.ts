import { z } from "zod";
import { looksLikePhone } from "./utils/phone";

// Shared building blocks -----------------------------------------------------
const id = z.string().min(1);
const dateish = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "must be a YYYY-MM-DD or ISO date");
const nonNegInt = z.number().int().min(0);
// Minutes since midnight local time, for the campaign/activation shift window
// enhancement (0 = 00:00, 1439 = 23:59).
const shiftMinutes = z.number().int().min(0).max(1439);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const phoneField = z.string().optional().refine(
  (v) => !v || !v.trim() || looksLikePhone(v),
  { message: "Enter a valid mobile number (e.g. 0771234567)" }
);

// FK-style id that also accepts the portal's "" for a blank optional field
// (issue #21 convention). "" must survive parsing so the handler's pickStaff
// can turn it into null — a PATCH that clears the field must still clear it;
// zod's bare .optional() only passes undefined, so "" would 400 with a
// misleading "is required" message (staff.cityId regression).
const optionalId = id.or(z.literal("")).optional();

// Shared by staffCreate and staffUpdate (as .partial()) so PATCH validates
// each field it's given the same way POST does, instead of the previous
// unchecked passthrough (issue #22).
const staffCreateSchema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  userType: z.enum(["promoter", "supervisor"]),
  mobileUsername: z.string().min(1),
  password: z.string().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  phone: phoneField,
  cityId: optionalId,
  reportsToStaffId: optionalId,
  linkedUserId: optionalId,
  nic: z.string().optional().refine(
    (v) => !v || /^(\d{9}[VXvX]|\d{12})$/.test(v.trim()),
    { message: "Invalid NIC format (e.g., 891234567V or 198912345678)" }
  ),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  permanentAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: phoneField,
  bankAccountName: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankBranch: z.string().optional(),
});

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
      customFields: z.record(z.string(), z.unknown()).optional(),
    })
    .partial(),
  salesSummaryRemarks: z.object({
    remarks: z.string().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
  }),
  salesSummaryConfirm: z
    .object({
      remarks: z.string().optional(),
      customFields: z.record(z.string(), z.unknown()).optional(),
    })
    .partial(),
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
    contactNumber: z.string().optional().refine(
      (v) => !v || !v.trim() || looksLikePhone(v),
      { message: "Enter a valid mobile number (e.g. 0771234567)" }
    ),
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  clientUpdate: z
    .object({
      companyName: z.string().min(1),
      clientName: z.string().min(1),
      contactNumber: z.string().refine(
        (v) => !v || !v.trim() || looksLikePhone(v),
        { message: "Enter a valid mobile number (e.g. 0771234567)" }
      ),
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
      imageUrl: z.string().nullable(),
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
    phone: z.string().optional().refine(
      (v) => !v || !v.trim() || looksLikePhone(v),
      { message: "Enter a valid mobile number (e.g. 0771234567)" }
    ),
    mobile: z.string().optional().refine(
      (v) => !v || !v.trim() || looksLikePhone(v),
      { message: "Enter a valid mobile number (e.g. 0771234567)" }
    ),
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
      phone: z.string().refine(
        (v) => !v || !v.trim() || looksLikePhone(v),
        { message: "Enter a valid mobile number (e.g. 0771234567)" }
      ),
      mobile: z.string().refine(
        (v) => !v || !v.trim() || looksLikePhone(v),
        { message: "Enter a valid mobile number (e.g. 0771234567)" }
      ),
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
    shiftStartMinutes: shiftMinutes.optional(),
    shiftEndMinutes: shiftMinutes.optional(),
    promoterLabel: z.string().trim().min(1).max(60).nullish(),
    testerFieldEnabled: z.boolean().optional(),
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
      shiftStartMinutes: shiftMinutes,
      shiftEndMinutes: shiftMinutes,
      promoterLabel: z.string().trim().min(1).max(60).nullable(),
      testerFieldEnabled: z.boolean(),
    })
    .partial(),
  campaignItemAdd: z
    .object({
      itemId: id.optional(),
      itemIds: z.array(id).optional(),
      newItem: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((v) => v.itemId || v.itemIds || v.newItem, { message: "itemId, itemIds or newItem required" }),
  // Link a back-office account (role "usr", "sponsor" or "supervisor") to a
  // campaign — either an existing user or a brand-new one created inline.
  // Callable by Super Admin or any existing Campaign Admin of this campaign
  // (see requireCampaignAccess).
  campaignAdminAdd: z
    .object({
      userId: id.optional(),
      roleId: z.enum(["usr", "sponsor", "supervisor"]).optional(),
      newUser: z
        .object({
          username: z.string().min(1),
          password: z.string().min(1),
          displayName: z.string().min(1),
          email: z.string().optional(),
          roleId: z.enum(["usr", "sponsor", "supervisor"]).optional(),
        })
        .optional(),
    })
    .refine((v) => v.userId || v.newUser, { message: "userId or newUser required" }),
  // License usage tracking — seat caps + warn threshold. All optional (PATCH
  // semantics); `warnThresholdPct` accepts null to clear the per-campaign
  // override and fall back to the global default.
  licenseUpdate: z
    .object({
      promoterCap: z.number().int().min(0),
      supervisorCap: z.number().int().min(0),
      adminCap: z.number().int().min(0),
      sponsorCap: z.number().int().min(0),
      warnThresholdPct: z.number().int().min(1).max(99).nullable(),
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" }),
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
    activationType: z.enum(["weekend", "monthly"]).optional(),
    shiftStartMinutes: shiftMinutes.nullish(),
    shiftEndMinutes: shiftMinutes.nullish(),
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
      activationType: z.enum(["weekend", "monthly"]),
      shiftStartMinutes: shiftMinutes.nullable(),
      shiftEndMinutes: shiftMinutes.nullable(),
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
  targetCreate: z
    .object({
      dateFrom: dateish,
      dateTo: dateish,
      targetItemId: id.optional(),
      targetBrandId: id.optional(),
      targetValue: z.number().int(),
      repeat: z.boolean().optional(),
    })
    .refine((v) => !!v.targetItemId !== !!v.targetBrandId, {
      message: "Exactly one of targetItemId or targetBrandId is required",
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

  // ---- Admin: custom sales fields (issue #13) ----
  salesFieldCreate: z
    .object({
      label: z.string().min(1),
      type: z.enum(["number", "text", "boolean", "select"]),
      scope: z.enum(["day", "product"]).optional(),
      options: z.array(z.string().min(1)).optional(),
      required: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    })
    .refine((v) => v.type !== "select" || (v.options && v.options.length >= 2), {
      message: "A dropdown field needs at least two options",
      path: ["options"],
    }),
  salesFieldUpdate: z
    .object({
      label: z.string().min(1),
      type: z.enum(["number", "text", "boolean", "select"]),
      scope: z.enum(["day", "product"]),
      options: z.array(z.string().min(1)),
      required: z.boolean(),
      sortOrder: z.number().int(),
      archived: z.boolean(),
    })
    .partial(),
  salesFieldValuesSave: z.object({
    activationId: id,
    date: dateish,
    day: z.record(z.string(), z.unknown()).optional(),
    products: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  }),

  // ---- Admin: staff / RBAC ----
  staffCreate: staffCreateSchema,
  // On edit the portal hides the password behind a "Reset Password" toggle; when
  // it isn't revealed the form submits "" (or omits it) — both mean "keep the
  // existing hash" (handlers hash only a non-empty value). min(1) still applies
  // to any non-empty value.
  staffUpdate: staffCreateSchema.partial().extend({
    password: z.string().min(1).optional().or(z.literal("")),
  }),
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
    .partial()
    .extend({ password: z.string().min(1).optional().or(z.literal("")) }),
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

  // ---- Portal "Report an issue" (docs/issue-reporting-spec.md) ----
  issueReportCreate: z.object({
    title: z.string().trim().min(4).max(160),
    body: z.string().trim().min(10).max(8000),
    category: z.enum(["bug", "enhancement", "question"]).default("bug"),
    severity: z.enum(["low", "normal", "high", "critical"]).optional(),
    context: z
      .object({
        page: z.string().max(300),
        persona: z.string().max(40),
        campaignName: z.string().max(200),
        portalVersion: z.string().max(50),
        userAgent: z.string().max(500),
      })
      .partial()
      .optional(),
  }),
};
