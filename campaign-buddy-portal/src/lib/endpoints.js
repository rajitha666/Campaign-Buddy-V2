// One function per endpoint in CampaignBuddy_Backend_Spec_v3.md §4.2, plus the
// portal-completion endpoints added to the backend so every screen here has a
// real route (catalog PATCH/DELETE, campaign/staff DELETE, role PATCH,
// activation-items GET, supervisor-tasks CRUD, staff-absence, outlet-attendance,
// tracking history, outlet-wise report).
import { api } from './apiClient';

// ---------- Auth ----------
export const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout', {}),
};

// ---------- Catalog ----------
export const clients = {
  list: (query) => api.get('/clients', { query }),
  create: (body) => api.post('/clients', body),
  update: (id, body) => api.patch(`/clients/${id}`, body),
  remove: (id) => api.delete(`/clients/${id}`),
};
export const brands = {
  list: (query) => api.get('/brands', { query }),
  create: (body) => api.post('/brands', body),
  update: (id, body) => api.patch(`/brands/${id}`, body),
  remove: (id) => api.delete(`/brands/${id}`),
};
export const items = {
  list: (query) => api.get('/items', { query }),
  create: (body) => api.post('/items', body),
  search: (search) => api.get('/items', { query: { search } }),
  update: (id, body) => api.patch(`/items/${id}`, body),
  remove: (id) => api.delete(`/items/${id}`),
};
export const outlets = {
  list: (query) => api.get('/outlets', { query }),
  create: (body) => api.post('/outlets', body),
  update: (id, body) => api.patch(`/outlets/${id}`, body),
  remove: (id) => api.delete(`/outlets/${id}`),
};
export const distributorPoints = {
  list: (query) => api.get('/distributor-points', { query }),
  create: (body) => api.post('/distributor-points', body),
  update: (id, body) => api.patch(`/distributor-points/${id}`, body),
  remove: (id) => api.delete(`/distributor-points/${id}`),
};
export const cities = {
  list: (query) => api.get('/cities', { query }),
  create: (body) => api.post('/cities', body),
  update: (id, body) => api.patch(`/cities/${id}`, body),
  remove: (id) => api.delete(`/cities/${id}`),
};

// ---------- Campaign setup ----------
export const campaigns = {
  list: (query) => api.get('/campaigns', { query }), // scoped to caller's CampaignAccessGrant
  create: (body) => api.post('/campaigns', body),
  get: (id) => api.get(`/campaigns/${id}`),
  update: (id, body) => api.patch(`/campaigns/${id}`, body),
  remove: (id) => api.delete(`/campaigns/${id}`),
  items: (id) => api.get(`/campaigns/${id}/items`),
  addItem: (id, body) => api.post(`/campaigns/${id}/items`, body), // {itemId} or {newItem:{...}}
  removeItem: (id, campaignItemId) => api.delete(`/campaigns/${id}/items/${campaignItemId}`),
};

// ---------- Staff & Activations ----------
export const staff = {
  search: (search) => api.get('/staff', { query: { search } }),
  create: (body) => api.post('/staff', body),
  update: (id, body) => api.patch(`/staff/${id}`, body),
  remove: (id) => api.delete(`/staff/${id}`),
  evaluation: (id, query) => api.get(`/staff/${id}/evaluation`, { query }),
};
export const activations = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/activations`, { query }),
  create: (campaignId, body) => api.post(`/campaigns/${campaignId}/activations`, body),
  get: (campaignId, activationId) => api.get(`/campaigns/${campaignId}/activations/${activationId}`),
  update: (campaignId, activationId, body) => api.patch(`/campaigns/${campaignId}/activations/${activationId}`, body),
  remove: (campaignId, activationId) => api.delete(`/campaigns/${campaignId}/activations/${activationId}`),
  items: (campaignId, activationId) => api.get(`/campaigns/${campaignId}/activations/${activationId}/items`),
  addItems: (campaignId, activationId, body) => api.post(`/campaigns/${campaignId}/activations/${activationId}/items`, body), // {campaignItemId} | {campaignItemIds:[...]} | {addAll:true}
  removeItem: (campaignId, activationId, activationItemId) => api.delete(`/campaigns/${campaignId}/activations/${activationId}/items/${activationItemId}`),
  targets: {
    list: (campaignId, activationId) => api.get(`/campaigns/${campaignId}/activations/${activationId}/targets`),
    create: (campaignId, activationId, body) => api.post(`/campaigns/${campaignId}/activations/${activationId}/targets`, body),
  },
};

// ---------- Attendance, Sales & Tracking ----------
export const attendance = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/attendance`, { query }), // {outletId, dateFrom, dateTo, role}
};
export const salesRecords = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/sales`, { query }),
  correct: (campaignId, salesRecordId, body) => api.patch(`/campaigns/${campaignId}/sales/${salesRecordId}`, body),
};
export const dailyStats = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/stats`, { query }),
};
export const tracking = {
  live: (campaignId) => api.get(`/campaigns/${campaignId}/tracking/live`),
  promoterHistory: (campaignId, query) => api.get(`/campaigns/${campaignId}/tracking/promoter-history`, { query }),
  supervisorHistory: (campaignId, query) => api.get(`/campaigns/${campaignId}/tracking/supervisor-history`, { query }),
};
export const leaveRequests = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/leave-requests`, { query }),
  decide: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/leave-requests/${id}`, body), // {status:'approved'|'declined'}
};

// ---------- Reporting ----------
export const reports = {
  skuWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/sku-wise`, { query }),
  brandWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/brand-wise`, { query }),
  outletWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/outlet-wise`, { query }),
  reorder: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/reorder`, { query }),
  attendanceMonthly: (campaignId, month) => api.get(`/campaigns/${campaignId}/reports/attendance-monthly`, { query: { month } }),
};

// ---------- RBAC administration ([adm] only) ----------
export const users = {
  list: (query) => api.get('/users', { query }),
  create: (body) => api.post('/users', body),
  update: (id, body) => api.patch(`/users/${id}`, body),
  campaignAccess: {
    list: (userId) => api.get(`/users/${userId}/campaign-access`),
    grant: (userId, body) => api.post(`/users/${userId}/campaign-access`, body), // {campaignId, scopeType:'all'|'subset', outletIds?}
    revoke: (userId, campaignId) => api.delete(`/users/${userId}/campaign-access/${campaignId}`),
  },
};
export const roles = {
  list: () => api.get('/roles'),
  create: (body) => api.post('/roles', body),
  update: (id, body) => api.patch(`/roles/${id}`, body),
};

// ---------- Campaign-scoped extras ----------
export const supervisorRoutes = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/supervisor-routes`, { query }), // {supervisorId, outletId, dateFrom, dateTo}
  create: (campaignId, body) => api.post(`/campaigns/${campaignId}/supervisor-routes`, body),    // {supervisorStaffId, outletIds, dateFrom, dateTo}
  update: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/supervisor-routes/${id}`, body),
  remove: (campaignId, id) => api.delete(`/campaigns/${campaignId}/supervisor-routes/${id}`),
};
export const salesLookup = {
  load: (campaignId, query) => api.get(`/campaigns/${campaignId}/sales/lookup`, { query }), // {staffId, outletId, activationId, date}
};
export const supervisorTasks = {
  list: (campaignId) => api.get(`/campaigns/${campaignId}/supervisor-tasks`),
  create: (campaignId, body) => api.post(`/campaigns/${campaignId}/supervisor-tasks`, body),
  update: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/supervisor-tasks/${id}`, body),
  remove: (campaignId, id) => api.delete(`/campaigns/${campaignId}/supervisor-tasks/${id}`),
};
export const staffAbsence = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/absence`, { query }), // {date, outletId}
};
export const outletAttendance = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/outlet-attendance`, { query }), // {date, outletId}
};

// Compatibility shims for pages that still import the old `assumed.*` names.
export const assumed = {
  staffProfileEvaluation: (staffId, query) => staff.evaluation(staffId, query),
  staffAbsence: (campaignId, date) => staffAbsence.list(campaignId, { date }),
  supervisorTasks,
  outletAttendance: (campaignId, query) => outletAttendance.list(campaignId, query),
  promoterTrackingHistory: (campaignId, query) => tracking.promoterHistory(campaignId, query),
  supervisorTrackingHistory: (campaignId, query) => tracking.supervisorHistory(campaignId, query),
  assignedRoutes: {
    list: (campaignId, query) => supervisorRoutes.list(campaignId, query),
    assign: (campaignId, body) => supervisorRoutes.create(campaignId, body),
  },
  updateSalesLoad: (campaignId, query) => salesLookup.load(campaignId, query),
  clientScopedReports: {
    // v3 §5.10: no separate client route — same /reports/*, grant-filtered.
    skuWise: (campaignId, query) => reports.skuWise(campaignId, query),
    brandWise: (campaignId, query) => reports.brandWise(campaignId, query),
  },
};
