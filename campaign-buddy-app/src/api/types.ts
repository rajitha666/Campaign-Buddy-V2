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
  /** Staff profile photo, served from the API (/uploads/...) — issue #18/#29. */
  profilePictureUrl?: string | null;
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
  /** `promoterLabel` is the campaign's designation label (e.g. "Beauty Advisor"); null/absent → "Promoter". */
  campaign: Pick<Campaign, 'id' | 'name' | 'startDate'> & { promoterLabel?: string | null };
  outlet: Outlet;
  shiftStart: ISODateTime | null;
  shiftEnd: ISODateTime | null;
}

/** GET /me/assignments entry (supervisor mode) — same shape as TodayAssignment, but there can be several. */
export type SupervisorAssignment = TodayAssignment;

/** GET /me/supervisor-routes entry — read-only planning itinerary, never drives check-in. */
export interface SupervisorRoute {
  id: UUID;
  campaign: Pick<Campaign, 'id' | 'name'>;
  outlets: Array<Pick<Outlet, 'id' | 'name'> & { address: string }>;
  dateFrom: ISODate;
  dateTo: ISODate;
}

/** One rung of the fixed 1–5 scale a supervisor scores a promoter on. */
export interface RatingScaleEntry {
  value: number;
  label: string;
  description: string;
}

export type ChecklistTaskType = 'range' | 'feedback' | 'photo';

/** An outlet-setup photo; `uploadedAt` is the server's clock, not the phone's. */
export interface ChecklistPhoto {
  url: string;
  uploadedAt: ISODateTime;
}

export interface ChecklistResponse {
  rating: number | null;
  feedback: string | null;
  photos: ChecklistPhoto[];
}

/** One admin-defined QA task plus today's saved answer for this outlet visit. */
export interface ChecklistTask {
  id: UUID;
  category: string;
  taskType: ChecklistTaskType;
  task: string;
  /** Photos to capture for a `photo` task; 0 otherwise. */
  imageCount: number;
  response: ChecklistResponse | null;
}

/** GET /me/assignments/:id/supervisor-tasks — the checklist for one outlet visit. */
export interface SupervisorChecklist {
  /** Which of today's visits to this outlet the checklist belongs to (each check-in starts a new one). */
  visitNo?: number;
  ratingScale: RatingScaleEntry[];
  promoter: { id: UUID; name: string };
  outlet: { id: UUID; name: string };
  tasks: ChecklistTask[];
}

export interface ChecklistAnswer {
  taskId: UUID;
  rating?: number | null;
  feedback?: string | null;
}

export type AttendanceStatus = 'on_time' | 'late' | 'leave' | 'absent' | 'pending';

export interface AttendanceRecord {
  id: UUID;
  userId: UUID;
  assignmentId: UUID;
  date: ISODate;
  /** A supervisor's Nth visit to this outlet today (1 for promoters). */
  visitNo?: number;
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
  /** The assignment this answer is about (the open shift's, when none was asked for). */
  assignmentId?: UUID | null;
  /** A supervisor's current (latest) visit to that outlet today. */
  visitNo?: number | null;
  /** Assignment of the shift currently open anywhere, or null. */
  openAssignmentId?: UUID | null;
  /** Promoters: assignments already checked out of today (an outlet is closed once worked). */
  workedAssignmentIds?: UUID[];
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
  /** Only for a write queued offline and delivered late (see api/stats.ts). */
  capturedAt?: string;
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
  /** Sum of every admin-set target active today (LKR), or null when none is set — hide the Target UI in that case. */
  target: number | null;
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
  imageUrl: string | null;
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
  /** Today's active target (LKR) projected across the activation's full calendar-day run, or null when no target is set. */
  totalTarget: number | null;
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
