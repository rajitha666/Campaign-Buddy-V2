/**
 * Types mirror `docs/api-spec.md` field-for-field (§2 Data Models).
 * If the backend changes a field name or type, update it here FIRST — every
 * screen imports from this file, so TypeScript will flag every call site
 * that needs updating.
 *
 * Conventions (see spec §1):
 *  - dates are `YYYY-MM-DD` strings, date-times are ISO 8601 UTC strings.
 *    We keep them as `string` here rather than `Date` so JSON parsing needs
 *    no custom reviver — convert to `Date` at the point of use if needed.
 *  - currency (LKR) is always a whole-number integer, never a decimal.
 */

export type UUID = string;
export type ISODate = string; // "2026-09-05"
export type ISODateTime = string; // "2026-09-05T04:19:00Z"

export type UserRole = 'field_rep' | 'campaign_owner' | 'admin';

export interface User {
  id: UUID;
  employeeId: string;
  fullName: string;
  /** Preferred short name for greetings; backend always sends it. */
  displayName: string;
  username: string;
  phone: string;
  role: UserRole;
  avatarInitials: string;
  reportsToUserId: UUID | null;
  reportsToName: string;
}

/** Admin-defined extra field on the daily sales update (issue #13, spec §2.14). */
export type CustomSalesFieldType = 'number' | 'text' | 'boolean' | 'select';
export interface CustomSalesField {
  key: string;
  label: string;
  type: CustomSalesFieldType;
  scope: 'day' | 'product';
  options: string[];
  required: boolean;
  sortOrder: number;
  value: number | boolean | string | null;
}

/** Map of custom-field key → new value (`null` clears it). */
export type CustomFieldWrite = Record<string, number | boolean | string | null>;

export interface Campaign {
  id: UUID;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  status: 'upcoming' | 'active' | 'ended';
  timezone: string; // IANA, e.g. "Asia/Colombo"
}

export interface Outlet {
  id: UUID;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

export interface Assignment {
  id: UUID;
  userId: UUID;
  campaignId: UUID;
  outletId: UUID;
  shiftDate: ISODate;
  shiftStart: ISODateTime | null;
  shiftEnd: ISODateTime | null;
}

/** Response shape of GET /me/assignments/today — denormalized for one call. */
export interface TodayAssignment {
  assignmentId: UUID;
  campaign: Pick<Campaign, 'id' | 'name' | 'startDate'>;
  outlet: Outlet;
  shiftStart: ISODateTime | null;
  shiftEnd: ISODateTime | null;
}

export type AttendanceStatus = 'on_time' | 'late' | 'leave' | 'absent' | 'pending';

export interface AttendanceRecord {
  id: UUID;
  userId: UUID;
  assignmentId: UUID;
  date: ISODate;
  checkInAt: ISODateTime | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInLocationVerified: boolean;
  checkOutAt: ISODateTime | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  salesSummaryConfirmedAtCheckout: boolean;
  status: AttendanceStatus;
  leaveRequestId: UUID | null;
}

/** GET /attendance/today response — a slimmer view for the Home/Attendance screens. */
export interface AttendanceToday {
  checkedIn: boolean;
  checkInAt: ISODateTime | null;
  checkOutAt: ISODateTime | null;
  shiftDurationSeconds: number;
  locationVerified: boolean;
  status: AttendanceStatus;
}

/** GET /attendance/history entry */
export interface AttendanceHistoryEntry {
  date: ISODate;
  checkInAt: ISODateTime | null;
  checkOutAt: ISODateTime | null;
  status: AttendanceStatus;
  leaveReason?: string;
}

export interface DailyStats {
  footFall: number;
  approached: number;
  converted: number;
  conversionRate: number; // 0..1, derived server-side
  totalSales: number; // LKR, read-only — never sent by the client
}

/** GET /stats/range entry (api-spec §6.10) — one day of the rep's own rollups */
export interface StatsRangeDay {
  date: ISODate;
  itemsReceived: number;
  itemsSold: number;
  totalSales: number; // LKR, computed server-side
  footFall: number;
  approached: number;
  converted: number;
  conversionRate: number; // 0..1, derived server-side
}

/** GET /stats/range response */
export interface StatsRangeResult {
  days: StatsRangeDay[]; // ascending, zero-seeded for every day in the range
  total: Omit<StatsRangeDay, 'date'>;
}

export interface Product {
  id: UUID;
  sku: string;
  name: string;
  unitPrice: number; // LKR
  imageUrl: string | null;
  description?: string;
  attributes?: string[];
  supplierName?: string;
}

/** GET /campaigns/{id}/outlets/{id}/products list item */
export interface CampaignProductListItem {
  campaignProductAssignmentId: UUID;
  product: Pick<Product, 'id' | 'sku' | 'name' | 'unitPrice' | 'imageUrl'>;
  openingStock: number;
  soldToday: number;
  otherInterestedCustomers: number;
  remainingStock: number; // read-only
  reorderFlag: boolean;
  customFields: CustomSalesField[]; // product-scope, with current values
}

/** GET /products/{id} response — includes the popup-only fields */
export interface ProductDetails extends Product {
  description: string;
  attributes: string[];
  supplierName: string;
  addedToCampaignAt: ISODate;
  soldAcrossAllOutletsToday: number;
}

/** PATCH /products/{cpaId}/stock request body — every field optional */
export interface StockUpdateRequest {
  openingStock?: number;
  soldToday?: number;
  otherInterestedCustomers?: number;
  reorderFlag?: boolean;
  customFields?: CustomFieldWrite; // product-scope custom fields (#13)
}

export interface StockEntry {
  id: UUID;
  campaignProductAssignmentId: UUID;
  userId: UUID;
  date: ISODate;
  openingStock: number;
  soldToday: number;
  otherInterestedCustomers: number;
  reorderFlag: boolean;
  remainingStock: number; // read-only
  updatedAt: ISODateTime;
  customFields: CustomSalesField[];
}

export interface SalesSummary {
  id: UUID;
  userId: UUID;
  assignmentId: UUID;
  date: ISODate;
  itemsReceived: number;
  itemsSold: number;
  itemsRemaining: number;
  totalSales: number; // LKR
  footFall: number;
  approached: number;
  converted: number;
  remarks: string | null;
  confirmed: boolean;
  confirmedAt: ISODateTime | null;
  customFields: CustomSalesField[]; // day-scope, with current values
}

export type TimeOffReason = 'sick_leave' | 'annual_leave' | 'personal' | 'other';
export type TimeOffStatus = 'pending' | 'approved' | 'declined';

export interface TimeOffRequest {
  id: UUID;
  userId: UUID;
  fromDate: ISODate;
  toDate: ISODate;
  days: number; // read-only
  reason: TimeOffReason;
  note: string | null;
  status: TimeOffStatus;
  approverId: UUID;
  approverName: string;
  createdAt: ISODateTime;
  decidedAt: ISODateTime | null;
}

export interface TimeOffBalance {
  pendingCount: number;
  takenThisYear: number;
}

export interface PerformanceDailySalesPoint {
  date: ISODate;
  amount: number; // LKR
}

export interface PerformanceTopProduct {
  productId: UUID;
  name: string;
  unitPrice: number;
  unitsSold: number;
}

export interface PerformanceSummary {
  campaignName: string;
  startDate: ISODate;
  dayNumber: number;
  totalDays: number;
  totalSales: number;
  totalUnitsSold: number;
  totalApproached: number;
  dailySales: PerformanceDailySalesPoint[];
  topProducts: PerformanceTopProduct[];
}

/** POST /location/ping request body */
export interface LocationPingRequest {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp: ISODateTime;
  batteryPercent?: number;
}

/** Standard error envelope — see spec §1.1 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
