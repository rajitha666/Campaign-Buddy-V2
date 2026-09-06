// One function per endpoint in CampaignBuddy_Unified_Backend_Spec.md §4.
// Endpoints marked "ASSUMED" are not explicitly listed in the spec but are
// implied by an admin-panel screen (see CampaignBuddy_AdminPanel_Feature_Specification.md) —
// flag these with the backend team before wiring the real thing.
import { api } from './apiClient';

// ---------- Auth ----------
export const auth = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout', {}),
};

// ---------- Catalog (§4.1) ----------
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

// ---------- Campaign setup (§4.2) ----------
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

// ---------- Staff & Activations (§4.3) ----------
export const staff = {
  search: (search) => api.get('/staff', { query: { search } }),
  create: (body) => api.post('/staff', body),
  update: (id, body) => api.patch(`/staff/${id}`, body),
  remove: (id) => api.delete(`/staff/${id}`),
  // Kept separate from create/update so those two stay plain JSON — see
  // CampaignBuddy_Full_Backend_Contract.md §4.9.1.
  uploadPhoto: (id, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.postForm(`/staff/${id}/photo`, formData);
  },
};
export const activations = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/activations`, { query }),
  create: (campaignId, body) => api.post(`/campaigns/${campaignId}/activations`, body),
  get: (campaignId, activationId) => api.get(`/campaigns/${campaignId}/activations/${activationId}`),
  update: (campaignId, activationId, body) => api.patch(`/campaigns/${campaignId}/activations/${activationId}`, body),
  remove: (campaignId, activationId) => api.delete(`/campaigns/${campaignId}/activations/${activationId}`),
  addItems: (campaignId, activationId, body) => api.post(`/campaigns/${campaignId}/activations/${activationId}/items`, body),
  targets: {
    list: (campaignId, activationId) => api.get(`/campaigns/${campaignId}/activations/${activationId}/targets`),
    create: (campaignId, activationId, body) => api.post(`/campaigns/${campaignId}/activations/${activationId}/targets`, body),
  },
};

// ---------- Attendance, Sales & Tracking (§4.4) ----------
export const attendance = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/attendance`, { query }), // {outletId, dateFrom, dateTo}
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
};
export const leaveRequests = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/leave-requests`, { query }),
  decide: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/leave-requests/${id}`, body), // {status:'approved'|'declined'}
};

// ---------- Reporting (§4.5) ----------
export const reports = {
  skuWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/sku-wise`, { query }),
  brandWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/brand-wise`, { query }),
  reorder: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/reorder`, { query }),
  attendanceMonthly: (campaignId, month) => api.get(`/campaigns/${campaignId}/reports/attendance-monthly`, { query: { month } }),
};

// ---------- RBAC administration (§4.6) ----------
export const users = {
  list: (query) => api.get('/users', { query }),
  create: (body) => api.post('/users', body),
  update: (id, body) => api.patch(`/users/${id}`, body),
  campaignAccess: {
    list: (userId) => api.get(`/users/${userId}/campaign-access`),
    grant: (userId, body) => api.post(`/users/${userId}/campaign-access`, body), // {campaignId, outletScope}
  },
};
export const roles = {
  list: () => api.get('/roles'),
  create: (body) => api.post('/roles', body),
  update: (id, body) => api.patch(`/roles/${id}`, body),
};

// ---------- Reconciled against Backend Spec v3 ----------
// These screens exist in the Admin Panel feature spec. Backend Spec v3 DOES
// implement the three below — campaign-scoped, folded in from the retired
// contract doc (v3 §4.2). Paths corrected to match what the backend serves.
export const supervisorRoutes = {
  list: (campaignId, query) => api.get(`/campaigns/${campaignId}/supervisor-routes`, { query }), // {supervisorId, outletId, dateFrom, dateTo}
  create: (campaignId, body) => api.post(`/campaigns/${campaignId}/supervisor-routes`, body),    // {supervisorStaffId, outletIds, dateFrom, dateTo}
  update: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/supervisor-routes/${id}`, body),
  remove: (campaignId, id) => api.delete(`/campaigns/${campaignId}/supervisor-routes/${id}`),
};
export const salesLookup = {
  // v3 §4.2: GET /campaigns/{id}/sales/lookup?staffId&outletId&activationId&date
  load: (campaignId, query) => api.get(`/campaigns/${campaignId}/sales/lookup`, { query }),
};
export const staffEvaluation = {
  // v3 §4.2: GET /admin/v1/staff/{staffId}/evaluation?dateFrom&dateTo
  get: (staffId, query) => api.get(`/staff/${staffId}/evaluation`, { query }),
};

// ---------- NOT in Backend Spec v3 — no endpoint exists yet ----------
// Screens whose backend route is genuinely unimplemented. Calling these 404s;
// the page shows its error state. Raise with the backend team before relying
// on any of them (shapes are best-guess from the feature spec).
export const assumed = {
  staffAbsence: (campaignId, date) => api.get(`/campaigns/${campaignId}/absence`, { query: { date } }),
  supervisorTasks: {
    list: (campaignId) => api.get(`/campaigns/${campaignId}/supervisor-tasks`),
    create: (campaignId, body) => api.post(`/campaigns/${campaignId}/supervisor-tasks`, body),
    update: (campaignId, id, body) => api.patch(`/campaigns/${campaignId}/supervisor-tasks/${id}`, body),
    remove: (campaignId, id) => api.delete(`/campaigns/${campaignId}/supervisor-tasks/${id}`),
  },
  outletAttendance: (campaignId, query) => api.get(`/campaigns/${campaignId}/outlet-attendance`, { query }),
  promoterTrackingHistory: (campaignId, query) => api.get(`/campaigns/${campaignId}/tracking/promoter-history`, { query }),
  supervisorTrackingHistory: (query) => api.get('/tracking/supervisor-history', { query }),
  clientScopedReports: {
    // v3 §5.10: there is deliberately no separate client-scoped report route —
    // the Sponsor calls the same /reports/* and gets grant-filtered results.
    skuWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/sku-wise`, { query }),
    brandWise: (campaignId, query) => api.get(`/campaigns/${campaignId}/reports/brand-wise`, { query }),
  },
};

// Back-compat: a couple of pages import `assumed.staffProfileEvaluation` /
// `assumed.assignedRoutes` / `assumed.updateSalesLoad`. Keep them pointing at
// the reconciled implementations so nothing breaks if a page isn't updated.
assumed.staffProfileEvaluation = staffEvaluation.get;
assumed.assignedRoutes = {
  list: (campaignId, query) => supervisorRoutes.list(campaignId, query),
  assign: (campaignId, body) => supervisorRoutes.create(campaignId, body),
};
assumed.updateSalesLoad = (campaignId, query) => salesLookup.load(campaignId, query);
