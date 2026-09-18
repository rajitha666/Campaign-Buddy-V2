// Config-driven list/CRUD pages. Each entry here is rendered by
// pages/ResourcePage.jsx. Anything too bespoke for a table (Dashboard,
// live map, calendars, the evaluation screen, Update Sales) has its own
// page component instead — see App.jsx for the full route map.
//
// `fetchList({ campaignId, query })` must resolve to `{ data, meta }`
// matching docs/api-spec.md §1.1's list envelope.
// `hydrate(rows)` is optional client-side joining (e.g. attach a clientName
// onto a Campaign row) for endpoints that return bare foreign keys.
import { lazy, Suspense } from 'react';
import Badge from '../components/Badge';
import Avatar from '../components/Avatar';
import ProductThumb from '../components/ProductThumb';
// Lazy: resources.jsx is imported by resources.test.jsx, which runs under
// vitest's `node` environment (no `window`) — a top-level `import 'leaflet'`
// would crash that test on module load even though it never renders anything.
const PromoterTrailMap = lazy(() => import('../components/PromoterTrailMap'));
import {
  clients as clientsApi, brands as brandsApi, items as itemsApi, outlets as outletsApi,
  distributorPoints as distributorPointsApi, cities as citiesApi, campaigns as campaignsApi,
  staff as staffApi, activations as activationsApi, attendance as attendanceApi,
  salesRecords as salesRecordsApi, leaveRequests as leaveRequestsApi,
  reports as reportsApi, users as usersApi, roles as rolesApi,
  supervisorTasks as supervisorTasksApi, staffAbsence as staffAbsenceApi,
  outletAttendance as outletAttendanceApi, tracking as trackingApi,
} from '../lib/endpoints';
import { validators, normalizePhone } from '../lib/validators';
import { staffLabel } from '../lib/staffLabel';

// @db.Date columns come back as "…T00:00:00.000Z"; render them in UTC so a
// negative-offset browser doesn't show the previous day. Timestamps (checkInAt,
// capturedAt, …) are real instants and render in local time.
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '');
// Explicit format (no `second`) so check-in/check-out times never show
// seconds, on screen or in exports (client doc A).
const fmtTime = (v) => (v ? new Date(v).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtClockTime = (v) => (v ? new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtISO = (v) => (v ? new Date(v).toISOString().slice(0, 10) : ''); // for <input type="date">
const nameOf = (s) => s?.displayName || s?.fullName || '';

// Campaign/Activation shift window fields store minutes-since-midnight on the
// wire; the "time" form field works in "HH:mm" for <input type="time">.
const minutesToHHMM = (m) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const hhmmToMinutes = (v) => {
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

// Sales Update Status's three-way compliance state (client doc D).
const STATUS_LABELS = { completed: 'Completed', pending: 'Pending', absent: 'Absent' };
const STATUS_BADGE_TYPES = { completed: 'success', pending: 'pending', absent: 'alert' };

const PROVINCES = ['Western', 'Eastern', 'Central', 'Southern', 'Sabaragamuwa', 'North Western', 'Northern', 'Uva', 'North Central'];
const DISTRICTS = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
  'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee', 'Kurunegala',
  'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle'];

async function optionsFrom(listFn, labelKey = 'name', valueKey = 'id') {
  // Explicit large pageSize — most list() endpoints default to a 25-per-page
  // cap server-side; a bare call would silently truncate any dropdown (or a
  // lookup map built from it) past the first page. Ignored by endpoints that
  // don't paginate at all.
  const res = await listFn({ pageSize: 1000 });
  return (res?.data || []).map((r) => ({ value: r[valueKey], label: r[labelKey] || r.fullName || r.displayName || r[valueKey] }));
}

// Staff dropdowns (Promoter/Supervisor) — see lib/staffLabel.js for the
// "Tharindu Jayasuriya" (name only) format shared across every such dropdown.
async function staffOptions() {
  const res = await staffApi.search('', { pageSize: 1000 });
  return (res?.data || []).map((r) => ({ value: r.id, label: staffLabel(r) }));
}

function buildLookup(rows, labelKey = 'name') {
  const map = {};
  (rows || []).forEach((r) => { map[r.id] = r[labelKey] || r.fullName || r.displayName; });
  return map;
}

async function hydrateActivations(rows) {
  // Deliberately NOT swallowing errors here (no .catch(() => null)) — if either
  // lookup fails, every row would silently render outletId/staffId in place of
  // a name, which looks like real (wrong) data rather than a failure. Letting
  // this throw surfaces a proper "could not load" + retry in ResourcePage
  // instead of a table quietly full of raw IDs until the user refreshes.
  // Explicit large pageSize — an unqualified list()/search() defaults to the
  // backend's 25-per-page cap, which would silently drop any outlet/staff
  // past the first page from the lookup (same raw-ID symptom, but
  // deterministic rather than transient).
  const [outletRes, staffRes] = await Promise.all([
    outletsApi.list({ pageSize: 1000 }),
    staffApi.search('', { pageSize: 1000 }),
  ]);
  const outletMap = buildLookup(outletRes?.data);
  const staffMap = buildLookup(staffRes?.data, 'displayName');
  // The activations payload embeds the related staff rows, so prefer those —
  // the /staff list used to build staffMap is active-only, which would leave a
  // deactivated (soft-deleted) promoter rendering as a raw staffId (#uuid bug)
  // even though its name is right there on the row.
  const staffNameOf = (r, idKey, relKey) =>
    r[relKey]?.displayName || r[relKey]?.fullName || staffMap[r[idKey]];
  return rows.map((r) => ({
    ...r,
    outletName: outletMap[r.outletId],
    staffName: staffNameOf(r, 'staffId', 'staff'),
    supervisorName: staffNameOf(r, 'supervisorStaffId', 'supervisor'),
  }));
}

// Pages whose backing endpoint does NOT honor page/pageSize server-side (it
// always returns the full list) — clientPaged() slices the returned rows into
// the page ResourcePage asked for and reports the unfiltered count as
// meta.total, so DataTable's pager works. Endpoints that DO paginate
// server-side (catalog, /staff, attendance, sales, tracking, …) must NOT be
// wrapped — their rows are already the requested page and re-slicing would
// double it.
const clientPaged = (fetchFn) => async (args) => {
  const res = await fetchFn(args);
  const data = res?.data || [];
  const page = args.query?.page || 1;
  const pageSize = args.query?.pageSize || 25;
  return {
    ...res,
    data: data.slice((page - 1) * pageSize, page * pageSize),
    meta: { ...(res?.meta || {}), total: res?.meta?.total ?? data.length },
  };
};

export const RESOURCES = {

  clients: {
    title: 'Clients', subtitle: 'Brand owners who commission campaigns.',
    addLabel: 'Add New Client', excel: false,
    columns: [
      { key: 'clientName', label: 'Client Name', render: (r) => <Avatar initials={(r.clientName || '?').slice(0, 2).toUpperCase()} name={r.clientName} sub={r.companyName} /> },
      { key: 'contactNumber', label: 'Contact' },
      { key: 'address', label: 'Address' },
      { key: 'email', label: 'Email' },
      { key: 'companyName', label: 'Company' },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => clientsApi.list(query),
    createItem: ({ values }) => clientsApi.create({
      companyName: values.companyName, clientName: values.clientName,
      contactNumber: normalizePhone(values.contactNumber), email: values.email, address: values.address,
    }),
    updateItem: ({ id, values }) => clientsApi.update(id, { ...values, contactNumber: normalizePhone(values.contactNumber) }),
    deleteItem: ({ id }) => clientsApi.remove(id),
    formFields: [
      { key: 'companyName', label: 'Company', type: 'text', required: true, placeholder: 'e.g. Prisha Naturals (Pvt) Ltd' },
      { key: 'clientName', label: 'Client Name', type: 'text', required: true, placeholder: 'Primary contact name' },
      { key: 'contactNumber', label: 'Contact Number', type: 'tel', required: true, placeholder: '0771234567', validate: (v) => validators.mobile()(normalizePhone(v)) },
      { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'name@company.lk' },
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
  },

  brands: {
    title: 'Brands', subtitle: 'Brand catalog, owned by clients.', addLabel: 'Add New Brand',
    columns: [
      { key: 'name', label: 'Brand Name', render: (r) => <Avatar name={r.name} /> },
      { key: 'clientName', label: 'Client', render: (r) => r.clientName || r.clientId || '—' },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => brandsApi.list(query),
    hydrate: async (rows) => {
      const clientRes = await clientsApi.list().catch(() => null);
      const map = buildLookup(clientRes?.data, 'clientName');
      return rows.map((r) => ({ ...r, clientName: map[r.clientId] }));
    },
    createItem: ({ values }) => brandsApi.create({ name: values.name, clientId: values.clientId }),
    updateItem: ({ id, values }) => brandsApi.update(id, { name: values.name, clientId: values.clientId }),
    deleteItem: ({ id }) => brandsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Brand Name', type: 'text', required: true },
      { key: 'clientId', label: 'Client', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
    ],
  },

  items: {
    title: 'Products', subtitle: 'Catalog-level products, shared across campaigns.', addLabel: 'Add New Product',
    columns: [
      { key: 'name', label: 'Product', render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <ProductThumb item={r} />
          <span>
            <span className="cell-strong">{r.name}</span>
            {r.sku ? <div className="cell-muted" style={{ marginTop: 2 }}>{r.sku}</div> : null}
          </span>
        </span>
      ) },
      { key: 'brandName', label: 'Brand', render: (r) => r.brandName || r.brandId },
      { key: 'unitPrice', label: 'Price', render: (r) => `LKR ${Number(r.unitPrice || 0).toLocaleString()}` },
      { key: 'reorderLevel', label: 'Reorder Level' },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => itemsApi.list(query),
    hydrate: async (rows) => {
      const brandRes = await brandsApi.list().catch(() => null);
      const map = buildLookup(brandRes?.data);
      return rows.map((r) => ({ ...r, brandName: map[r.brandId] }));
    },
    createItem: async ({ values }) => {
      const created = await itemsApi.create({
        name: values.name, brandId: values.brandId, sku: values.sku, description: values.description,
        unitPrice: Number(values.unitPrice) || 0, reorderLevel: Number(values.reorderLevel) || 0,
      });
      if (values.image instanceof File) await itemsApi.uploadImage(created.data.id, values.image);
      return created;
    },
    updateItem: async ({ id, values }) => {
      const updated = await itemsApi.update(id, {
        name: values.name, brandId: values.brandId, sku: values.sku, description: values.description,
        unitPrice: Number(values.unitPrice) || 0, reorderLevel: Number(values.reorderLevel) || 0,
      });
      if (values.image instanceof File) await itemsApi.uploadImage(id, values.image);
      return updated;
    },
    deleteItem: ({ id }) => itemsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Product Name', type: 'text', required: true },
      { key: 'sku', label: 'SKU', type: 'text', required: true, validate: validators.required() },
      { key: 'brandId', label: 'Brand', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(brandsApi.list) },
      { key: 'shortDescription', label: 'Short Description', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'unitPrice', label: 'Price (LKR)', type: 'number', step: 1, required: true, validate: (v) => validators.integer()(v) || validators.required()(v) },
      { key: 'reorderLevel', label: 'Re-order Level', type: 'number', step: 1, required: true, validate: validators.integer() },
      { key: 'image', label: 'Image', type: 'upload', previewKey: 'imageUrl' },
    ],
  },

  outlets: {
    title: 'Outlets', subtitle: 'Retail locations where activations run.', addLabel: 'Add New Outlet', excel: true,
    columns: [
      { key: 'name', label: 'Outlet Name', render: (r) => <Avatar name={r.name} sub={r.address} /> },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'cityName', label: 'City', render: (r) => r.cityName || r.cityId },
      { key: 'phone', label: 'Phone' },
      { key: 'mobile', label: 'Mobile' },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => outletsApi.list(query),
    hydrate: async (rows) => {
      const cityRes = await citiesApi.list().catch(() => null);
      const map = buildLookup(cityRes?.data, 'name');
      return rows.map((r) => ({ ...r, cityName: map[r.cityId] }));
    },
    createItem: ({ values }) => outletsApi.create({
      outletNo: values.outletNo,       name: values.name, contactPerson: values.contactPerson, address: values.address, cityId: values.cityId,
      phone: normalizePhone(values.phone), mobile: normalizePhone(values.mobile), fax: values.fax,
      latitude: Number(values.geo?.lat), longitude: Number(values.geo?.lng),
    }),
    updateItem: ({ id, values }) => outletsApi.update(id, {
      outletNo: values.outletNo,       name: values.name, contactPerson: values.contactPerson, address: values.address, cityId: values.cityId,
      phone: normalizePhone(values.phone), mobile: normalizePhone(values.mobile), fax: values.fax,
      latitude: Number(values.geo?.lat), longitude: Number(values.geo?.lng),
    }),
    deleteItem: ({ id }) => outletsApi.remove(id),
    formFields: [
      { key: 'outletNo', label: 'Outlet No', type: 'text', required: true },
      { key: 'name', label: 'Outlet Name', type: 'text', required: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea', required: true },
      { key: 'cityId', label: 'City', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'phone', label: 'Phone', type: 'tel', pattern: '\\+?\\d[\\d\\s()\\-]{7,14}\\d', placeholder: '0771234567', validate: (v) => validators.mobile()(normalizePhone(v)) },
      { key: 'mobile', label: 'Mobile', type: 'tel', pattern: '\\+?\\d[\\d\\s()\\-]{7,14}\\d', placeholder: '0771234567', validate: (v) => validators.mobile()(normalizePhone(v)) },
      { key: 'fax', label: 'Fax', type: 'tel', pattern: '\\+?\\d[\\d\\s()\\-]{7,14}\\d' },
      { key: 'geo', label: 'Coordinates', type: 'geocode' },
    ],
  },

  distributors: {
    title: 'Distributor Points', subtitle: 'Restock/supply points, shared across campaigns.',
    addLabel: 'Add New Distributor', saveLabel: 'Add', excel: true,
    columns: [
      { key: 'name', label: 'Name', render: (r) => <Avatar name={r.name} /> },
      { key: 'contact', label: 'Contact' }, { key: 'address', label: 'Address' },
      { key: 'clientName', label: 'Client', render: (r) => r.clientName || r.clientId },
      { key: 'cityName', label: 'City', render: (r) => r.cityName || r.cityId },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => distributorPointsApi.list(query),
    hydrate: async (rows) => {
      const [cityRes, clientRes] = await Promise.all([citiesApi.list().catch(() => null), clientsApi.list().catch(() => null)]);
      const cityMap = buildLookup(cityRes?.data);
      const clientMap = buildLookup(clientRes?.data, 'clientName');
      return rows.map((r) => ({ ...r, cityName: cityMap[r.cityId], clientName: clientMap[r.clientId] }));
    },
    createItem: ({ values }) => distributorPointsApi.create(values),
    updateItem: ({ id, values }) => distributorPointsApi.update(id, values),
    deleteItem: ({ id }) => distributorPointsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Distributor Name', type: 'text', required: true },
      { key: 'contact', label: 'Contact', type: 'text' },
      { key: 'address', label: 'Address', type: 'text' },
      { key: 'cityId', label: 'City', type: 'searchable-select', optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'clientId', label: 'Client', type: 'searchable-select', optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
    ],
  },

  cities: {
    title: 'Cities', subtitle: 'Master lookup used by Outlets, Distributor Points and Staff.', addLabel: 'Add New City',
    columns: [{ key: 'name', label: 'City Name' }, { key: 'province', label: 'Province' }, { key: 'district', label: 'District' }],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => citiesApi.list(query),
    createItem: ({ values }) => citiesApi.create(values),
    updateItem: ({ id, values }) => citiesApi.update(id, values),
    deleteItem: ({ id }) => citiesApi.remove(id),
    formFields: [
      { key: 'name', label: 'City Name', type: 'text', required: true },
      { key: 'province', label: 'Province', type: 'searchable-select', required: true, options: PROVINCES },
      { key: 'district', label: 'District', type: 'searchable-select', required: true, options: DISTRICTS },
    ],
  },

  campaigns: {
    title: 'Campaigns', subtitle: 'All campaigns run for your clients.', addLabel: 'Add New Campaign',
    columns: [
      { key: 'name', label: 'Name', render: (r) => <Avatar name={r.name} sub={r.campaignNo} /> },
      { key: 'clientName', label: 'Client', render: (r) => r.clientName || r.clientId },
      { key: 'startDate', label: 'From', render: (r) => fmtDate(r.startDate) },
      { key: 'endDate', label: 'To', render: (r) => fmtDate(r.endDate) },
      { key: 'shift', label: 'Shift', render: (r) => `${minutesToHHMM(r.shiftStartMinutes)}–${minutesToHHMM(r.shiftEndMinutes)}` },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'active' ? 'success' : r.status === 'ended' ? 'muted' : 'pending'}>{r.status}</Badge> },
    ],
    actions: ['viewItems', 'items', 'admins', 'edit', 'delete'],
    viewItemsModal: 'campaignProducts',
    fetchList: ({ query }) => campaignsApi.list(query),
    hydrate: async (rows) => {
      const clientRes = await clientsApi.list().catch(() => null);
      const map = buildLookup(clientRes?.data, 'clientName');
      return rows.map((r) => ({ ...r, clientName: map[r.clientId] }));
    },
    editValues: (row) => ({
      campaignNo: row.campaignNo, name: row.name, clientId: row.clientId,
      description: row.description, dateRange: [fmtISO(row.startDate), fmtISO(row.endDate)],
      shiftStart: minutesToHHMM(row.shiftStartMinutes), shiftEnd: minutesToHHMM(row.shiftEndMinutes),
      promoterLabel: row.promoterLabel || '',
      testerFieldEnabled: row.testerFieldEnabled ?? false,
    }),
    createItem: ({ values }) => campaignsApi.create({
      campaignNo: values.campaignNo, name: values.name, clientId: values.clientId,
      description: values.description, startDate: values.dateRange?.[0], endDate: values.dateRange?.[1],
      ...(values.shiftStart ? { shiftStartMinutes: hhmmToMinutes(values.shiftStart) } : {}),
      ...(values.shiftEnd ? { shiftEndMinutes: hhmmToMinutes(values.shiftEnd) } : {}),
      ...(values.promoterLabel ? { promoterLabel: values.promoterLabel } : {}),
      testerFieldEnabled: !!values.testerFieldEnabled,
    }),
    updateItem: ({ id, values }) => campaignsApi.update(id, {
      campaignNo: values.campaignNo, name: values.name, clientId: values.clientId,
      description: values.description,
      ...(values.dateRange?.[0] ? { startDate: values.dateRange[0] } : {}),
      ...(values.dateRange?.[1] ? { endDate: values.dateRange[1] } : {}),
      shiftStartMinutes: hhmmToMinutes(values.shiftStart), shiftEndMinutes: hhmmToMinutes(values.shiftEnd),
      promoterLabel: values.promoterLabel || null,
      testerFieldEnabled: !!values.testerFieldEnabled,
    }),
    deleteItem: ({ id }) => campaignsApi.remove(id),
    formFields: [
      { key: 'campaignNo', label: 'Campaign No', type: 'text', required: true, placeholder: 'CMP-0234' },
      { key: 'name', label: 'Campaign Name', type: 'text', required: true },
      { key: 'clientId', label: 'Client', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
      { key: 'shiftStart', label: 'Shift start', type: 'time', defaultValue: '09:00', hint: 'Default check-in time for every activation in this campaign — used for late/on-time flagging.' },
      { key: 'shiftEnd', label: 'Shift end', type: 'time', defaultValue: '18:00', hint: 'Default check-out time — used for the end-of-day auto check-out.' },
      { key: 'promoterLabel', label: 'Designation Label', type: 'text', placeholder: 'Promoter', hint: 'Swaps "Promoter" for this word everywhere in the portal for this campaign, e.g. "Beauty Advisor". Leave blank to keep "Promoter".' },
      {
        key: 'testerFieldEnabled', label: 'Tester Field', type: 'radio', defaultValue: false,
        hint: 'Adds a "Tester" count (how many testers a customer tried) to the Update Sales page and Outlet Wise report.',
        options: [{ value: true, label: 'Enabled' }, { value: false, label: 'Disabled' }],
      },
    ],
    itemsRoute: (row) => `/campaigns/${row.id}/items`,
    adminsRoute: (row) => `/campaigns/${row.id}/admins`,
  },

  activations: {
    title: 'Activations', subtitle: 'Field-rep assignments to a campaign + outlet.', addLabel: 'Add New Activation',
    scopeToCampaign: true,
    columns: [
      { key: 'name', label: 'Activation', render: (r) => <Avatar name={r.name} /> },
      { key: 'outletName', label: 'Outlet', render: (r) => r.outletName || r.outletId },
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'supervisorName', label: 'Supervisor', render: (r) => r.supervisorName || r.supervisorStaffId || '—' },
      { key: 'activationType', label: 'Type', render: (r) => <Badge type={r.activationType === 'weekend' ? 'info' : 'muted'}>{r.activationType === 'weekend' ? 'Weekend' : 'Monthly'}</Badge> },
      { key: 'dateFrom', label: 'From', render: (r) => fmtDate(r.dateFrom) },
      { key: 'dateTo', label: 'To', render: (r) => fmtDate(r.dateTo) },
    ],
    actions: ['target', 'items', 'edit', 'delete'],
    fetchList: clientPaged(({ campaignId, query }) => activationsApi.list(campaignId, query)),
    hydrate: hydrateActivations,
    editValues: (row) => ({
      name: row.name, outletId: row.outletId, staffId: row.staffId,
      supervisorStaffId: row.supervisorStaffId, distributorPointId: row.distributorPointId,
      dateRange: [fmtISO(row.dateFrom), fmtISO(row.dateTo)],
      targetType: row.targetType, targetCategorization: row.targetCategorization, targetUnit: row.targetUnit,
      activationType: row.activationType,
      shiftStart: minutesToHHMM(row.shiftStartMinutes), shiftEnd: minutesToHHMM(row.shiftEndMinutes),
    }),
    // Prefills the new activation's date range from the parent campaign's
    // dates — still freely editable, not constrained to that range.
    addDefaults: (campaign) => ({
      dateRange: campaign ? [fmtISO(campaign.startDate), fmtISO(campaign.endDate)] : undefined,
      activationType: 'monthly',
    }),
    createItem: ({ campaignId, values }) => activationsApi.create(campaignId, {
      name: values.name, outletId: values.outletId, staffId: values.staffId,
      supervisorStaffId: values.supervisorStaffId, distributorPointId: values.distributorPointId || null,
      dateFrom: values.dateRange?.[0], dateTo: values.dateRange?.[1],
      targetType: values.targetType, targetCategorization: values.targetCategorization, targetUnit: values.targetUnit,
      activationType: values.activationType,
      shiftStartMinutes: hhmmToMinutes(values.shiftStart), shiftEndMinutes: hhmmToMinutes(values.shiftEnd),
    }),
    updateItem: ({ campaignId, id, values }) => activationsApi.update(campaignId, id, {
      name: values.name, outletId: values.outletId, staffId: values.staffId,
      supervisorStaffId: values.supervisorStaffId, distributorPointId: values.distributorPointId || null,
      ...(values.dateRange?.[0] ? { dateFrom: values.dateRange[0] } : {}),
      ...(values.dateRange?.[1] ? { dateTo: values.dateRange[1] } : {}),
      targetType: values.targetType, targetCategorization: values.targetCategorization, targetUnit: values.targetUnit,
      activationType: values.activationType,
      shiftStartMinutes: hhmmToMinutes(values.shiftStart), shiftEndMinutes: hhmmToMinutes(values.shiftEnd),
    }),
    deleteItem: ({ campaignId, id }) => activationsApi.remove(campaignId, id),
    formFields: [
      { key: 'name', label: 'Activation Name', type: 'text', required: true },
      { key: 'outletId', label: 'Outlet', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'staffId', label: 'Promoter', type: 'searchable-select', required: true, optionsLoader: staffOptions },
      { key: 'supervisorStaffId', label: 'Supervisor', type: 'searchable-select', required: true, optionsLoader: staffOptions },
      { key: 'distributorPointId', label: 'Distributor Point', type: 'searchable-select', optionsLoader: () => optionsFrom(distributorPointsApi.list) },
      { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
      {
        key: 'activationType', label: 'Activation Type', type: 'radio', required: true,
        hint: 'Governs day-counting and target pacing on the Overall Performance view — weekend runs Sat/Sun (÷8 working days/month), monthly runs Mon-Fri (÷25).',
        options: [{ value: 'weekend', label: 'Weekend' }, { value: 'monthly', label: 'Monthly' }],
      },
      { key: 'targetType', label: 'Target Type', type: 'radio', options: [{ value: 'item_wise', label: 'Product Wise' }, { value: 'brand_wise', label: 'Brand Wise' }] },
      { key: 'targetCategorization', label: 'Target Categorization', type: 'radio', options: [{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }] },
      { key: 'targetUnit', label: 'Target Unit', type: 'radio', options: [{ value: 'unit_wise', label: 'Unit Wise' }, { value: 'sales_wise', label: 'Sales Wise' }] },
      { key: 'shiftStart', label: 'Shift start override', type: 'time', hint: 'Leave blank to use the campaign’s default shift.' },
      { key: 'shiftEnd', label: 'Shift end override', type: 'time', hint: 'Leave blank to use the campaign’s default shift.' },
    ],
    targetRoute: (row, campaignId) => `/campaigns/${campaignId}/activations/${row.id}/targets`,
    itemsRoute: (row, campaignId) => `/campaigns/${campaignId}/activations/${row.id}/items`,
  },

  staff: {
    title: 'Staff', subtitle: 'Promoters and supervisors across all campaigns.', addLabel: 'Add New Member',
    columns: [
      { key: 'displayName', label: 'Name', render: (r) => <Avatar initials={(r.displayName || '?').slice(0, 2).toUpperCase()} imageUrl={r.profilePictureUrl} name={r.displayName || r.fullName} sub={r.employeeId} /> },
      { key: 'userType', label: 'Type', render: (r) => <Badge type={r.userType === 'supervisor' ? 'success' : 'info'}>{r.userType}</Badge> },
      { key: 'mobileUsername', label: 'App Username' },
      { key: 'cityName', label: 'Home City', render: (r) => r.cityName || r.cityId || '—' },
      { key: 'phone', label: 'Mobile' },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge> },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => staffApi.search(query?.search || '', query),
    hydrate: async (rows) => {
      const cityRes = await citiesApi.list().catch(() => null);
      const map = buildLookup(cityRes?.data);
      return rows.map((r) => ({ ...r, cityName: map[r.cityId] }));
    },
    editValues: (row) => ({
      ...row,
      dateOfBirth: row.dateOfBirth ? fmtISO(row.dateOfBirth) : '',
    }),
    createItem: async ({ values }) => {
      // `image` (the picked File) and `profilePictureUrl` (existing photo) are
      // not JSON fields — the photo goes through the multipart upload route.
      const { image, profilePictureUrl, ...jsonValues } = values;
      const created = await staffApi.create({ ...jsonValues, phone: normalizePhone(values.phone), emergencyContactPhone: normalizePhone(values.emergencyContactPhone) });
      // The photo endpoint targets an existing staff row, so the picked file
      // uploads only after create — same pattern as catalog item images.
      if (image instanceof File) await staffApi.uploadPhoto(created.data.id, image);
      return created;
    },
    updateItem: async ({ id, values }) => {
      // Blank password = "keep existing" — never send it on the wire.
      const { image, profilePictureUrl, password, ...jsonValues } = values;
      const body = { ...jsonValues, phone: normalizePhone(values.phone), emergencyContactPhone: normalizePhone(values.emergencyContactPhone) };
      if (password) body.password = password;
      const updated = await staffApi.update(id, body);
      if (image instanceof File) await staffApi.uploadPhoto(id, image);
      return updated;
    },
    deleteItem: ({ id }) => staffApi.remove(id),
    // Fixed HR field set for v3 (schema / Changelog v3 "Staff HR fields"). The
    // backend whitelists these columns; extras are ignored.
    formFields: [
      { type: 'section', label: 'Basic Info' },
      { key: 'employeeId', label: 'Employee ID', type: 'text', required: true, placeholder: 'e.g. EMP-0042' },
      { key: 'fullName', label: 'Full Name', type: 'text', required: true },
      { key: 'displayName', label: 'Display Name (App Name)', type: 'text', required: true },
      { key: 'userType', label: 'User Type', type: 'radio', required: true, options: [{ value: 'promoter', label: 'Promoter' }, { value: 'supervisor', label: 'Supervisor' }] },
      { key: 'status', label: 'Status', type: 'radio', required: true, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      { key: 'gender', label: 'Gender', type: 'radio', options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
      { key: 'nic', label: 'NIC', type: 'text', placeholder: 'National ID number', validate: validators.nic() },
      { key: 'phone', label: 'Mobile', type: 'tel', pattern: '\\+?\\d[\\d\\s()\\-]{7,14}\\d', placeholder: '0771234567', validate: (v) => validators.mobile()(normalizePhone(v)) },
      // Promoter's city of residence — HR profile data, independent of any outlet
      // or activation. See issue #5: it is NOT derived from the assigned outlet.
      { key: 'cityId', label: 'Home City', type: 'searchable-select', optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea' },
      { key: 'currentAddress', label: 'Current Address', type: 'textarea' },
      { key: 'image', label: 'Profile Photo', type: 'upload', previewKey: 'profilePictureUrl' },

      { type: 'section', label: 'Login' },
      { key: 'mobileUsername', label: 'Mobile App Username', type: 'text', required: true, placeholder: 'lowercase, no spaces' },
      { key: 'password', label: 'Password', type: 'text', required: true, resettable: true, placeholder: 'Set initial password' },

      { type: 'section', label: 'Emergency Contact' },
      { key: 'emergencyContactName', label: 'Contact Name', type: 'text' },
      { key: 'emergencyContactPhone', label: 'Contact Phone', type: 'tel', pattern: '\\+?\\d[\\d\\s()\\-]{7,14}\\d', placeholder: '0771234567', validate: (v) => validators.mobile()(normalizePhone(v)) },

      { type: 'section', label: 'Bank Account' },
      { key: 'bankAccountName', label: 'Account Name', type: 'text' },
      { key: 'bankName', label: 'Bank', type: 'text' },
      { key: 'bankAccountNumber', label: 'Account Number', type: 'text' },
      { key: 'bankBranch', label: 'Branch', type: 'text' },
    ],
  },

  staffAttendance: {
    title: 'Staff Attendance', subtitle: 'Check-in / check-out log for field promoters.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
    ],
    columns: [
      { key: 'outletName', label: 'Outlet', render: (r) => r.activation?.outlet?.name || '—' },
      { key: 'staffName', label: 'Promoter', render: (r) => r.activation?.staff?.fullName || nameOf(r.activation?.staff) || '—' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'checkInAt', label: 'Check-in', render: (r) => fmtClockTime(r.checkInAt) },
      { key: 'checkOutAt', label: 'Check-out', render: (r) => fmtClockTime(r.checkOutAt) },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'on_time' ? 'success' : r.status === 'late' ? 'pending' : 'muted'}>{r.status}</Badge> },
    ],
    fetchList: ({ campaignId, query }) => attendanceApi.list(campaignId, query),
  },

  staffAbsence: {
    title: 'Staff Absence', subtitle: 'Promoters scheduled but not checked in for the selected date.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'activationName', label: 'Activation' },
      { key: 'outletName', label: 'Outlet' },
      { key: 'staffName', label: 'Promoter' },
      { key: 'onLeave', label: 'Reason', render: (r) => <Badge type={r.onLeave ? 'info' : 'alert'}>{r.onLeave ? 'On leave' : 'No check-in'}</Badge> },
    ],
    fetchList: ({ campaignId, query }) => {
      if (!query?.date) return Promise.resolve({ data: [], meta: { total: 0 } });
      return staffAbsenceApi.list(campaignId, query);
    },
    emptyHint: 'Pick a date above and Load. Promoters with an activation covering that day but no check-in appear here.',
  },

  leaveRequests: {
    title: 'Leave Requests', subtitle: 'Time-off submitted from the mobile app.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'staffName', label: 'Employee', render: (r) => r.staff?.fullName || r.staffId },
      { key: 'fromDate', label: 'From', render: (r) => fmtDate(r.fromDate) },
      { key: 'toDate', label: 'To', render: (r) => fmtDate(r.toDate) },
      { key: 'reason', label: 'Reason', render: (r) => <Badge type="info">{r.reason}</Badge> },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'approved' ? 'success' : r.status === 'declined' ? 'alert' : 'pending'}>{r.status}</Badge> },
    ],
    actions: ['approve', 'decline'],
    fetchList: ({ campaignId, query }) => leaveRequestsApi.list(campaignId, query),
    onRowAction: async ({ action, row, campaignId }) => {
      if (action === 'approve') return leaveRequestsApi.decide(campaignId, row.id, { status: 'approved' });
      if (action === 'decline') return leaveRequestsApi.decide(campaignId, row.id, { status: 'declined' });
    },
  },

  supervisorTasks: {
    title: 'Supervisor Tasks', subtitle: 'QA checklist supervisors fill out during outlet visits.', addLabel: 'Add New Task',
    scopeToCampaign: true,
    columns: [
      { key: 'task', label: 'Task' }, { key: 'category', label: 'Category' },
      { key: 'taskType', label: 'Task Type', render: (r) => <Badge type={r.taskType === 'range' ? 'info' : 'muted'}>{r.taskType}</Badge> },
    ],
    actions: ['edit', 'delete'],
    fetchList: clientPaged(({ campaignId, query }) => supervisorTasksApi.list(campaignId, query)),
    createItem: ({ campaignId, values }) => supervisorTasksApi.create(campaignId, values),
    updateItem: ({ campaignId, id, values }) => supervisorTasksApi.update(campaignId, id, values),
    deleteItem: ({ campaignId, id }) => supervisorTasksApi.remove(campaignId, id),
    formFields: [
      { key: 'category', label: 'Category', type: 'searchable-select', required: true, options: ['Sale', 'Outlet PR', 'Documentation', 'Discipline', 'Competitor Activities', 'Communication', 'Capability / Knowledge', 'Attitude', 'Attire & Grooming'] },
      { key: 'taskType', label: 'Task Type', type: 'radio', options: [{ value: 'range', label: 'Range' }, { value: 'feedback', label: 'Feedback' }] },
      { key: 'task', label: 'Task', type: 'textarea', required: true, placeholder: 'The question or instruction shown to the supervisor' },
    ],
  },

  outletAttendance: {
    title: 'Outlet Attendance', subtitle: 'Supervisor visit log, cross-checked against promoter attendance.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'supervisorName', label: 'Supervisor' }, { key: 'outletName', label: 'Outlet' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'checkInAt', label: 'Check-in', render: (r) => fmtTime(r.checkInAt) },
      { key: 'checkOutAt', label: 'Check-out', render: (r) => fmtTime(r.checkOutAt) },
    ],
    fetchList: ({ campaignId, query }) => outletAttendanceApi.list(campaignId, query),
  },

  supervisorAttendance: {
    title: 'Supervisor Attendance', subtitle: "Supervisors' own check-in log.", excel: true, noAdd: true,
    scopeToCampaign: true,
    columns: [
      { key: 'staffName', label: 'Supervisor', render: (r) => r.activation?.staff?.fullName || '—' },
      { key: 'outletName', label: 'Outlet', render: (r) => r.activation?.outlet?.name || '—' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'checkInAt', label: 'Check-in', render: (r) => fmtTime(r.checkInAt) },
      { key: 'checkOutAt', label: 'Check-out', render: (r) => fmtTime(r.checkOutAt) },
    ],
    fetchList: ({ campaignId, query }) => attendanceApi.list(campaignId, { ...query, role: 'supervisor' }),
  },

  promoterListReadOnly: {
    title: 'Promoter List', subtitle: 'Read-only staff directory.', noAdd: true,
    columns: [
      { key: 'displayName', label: 'Name', render: (r) => <Avatar name={r.displayName || r.fullName} /> },
      { key: 'userType', label: 'Type', render: (r) => <Badge type="info">{r.userType}</Badge> },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Mobile' },
    ],
    actions: ['view'],
    fetchList: ({ query }) => staffApi.search(query?.search || '', query),
  },

  skuSales: {
    title: 'Overall Outlet and SKU Wise', subtitle: 'Raw per-item, per-outlet sales log.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) }, { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'outletName', label: 'Outlet', render: (r) => r.activationItem?.activation?.outlet?.name || '—' },
      { key: 'staffName', label: 'Promoter', render: (r) => r.activationItem?.activation?.staff ? staffLabel(r.activationItem.activation.staff) : '—' },
      { key: 'itemName', label: 'Product', render: (r) => r.activationItem?.campaignItem?.item?.name || '—' },
      { key: 'unitPrice', label: 'Unit Price', render: (r) => `LKR ${Number(r.activationItem?.campaignItem?.item?.unitPrice || 0).toLocaleString()}`, csvValue: (r) => r.activationItem?.campaignItem?.item?.unitPrice || 0 },
      { key: 'openingStock', label: 'Start Qty' }, { key: 'soldToday', label: 'Sold Qty' },
      {
        key: 'totalSales', label: 'Total Sales',
        render: (r) => `LKR ${Number((r.soldToday || 0) * (r.activationItem?.campaignItem?.item?.unitPrice || 0)).toLocaleString()}`,
        csvValue: (r) => (r.soldToday || 0) * (r.activationItem?.campaignItem?.item?.unitPrice || 0),
      },
    ],
    fetchList: ({ campaignId, query }) => salesRecordsApi.list(campaignId, query),
  },

  salesStatus: {
    title: 'Sales Update Status', subtitle: "Daily submission-compliance — did each promoter submit today's sales.", excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'outletName', label: 'Outlet' },
      { key: 'staffName', label: 'Promoter' },
      {
        key: 'status', label: 'Status',
        csvValue: (r) => STATUS_LABELS[r.status] || r.status,
        render: (r) => <Badge type={STATUS_BADGE_TYPES[r.status] || 'muted'}>{STATUS_LABELS[r.status] || r.status}</Badge>,
      },
    ],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.salesStatus(campaignId, query)),
  },

  reportSkuWise: {
    title: 'Overall SKU Wise', subtitle: 'Aggregated sales by item, across the campaign.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [{ key: 'itemName', label: 'Product' }, { key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Product Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.skuWise(campaignId, query)),
  },

  reportBrandWise: {
    title: 'Brand Wise', subtitle: 'Aggregated sales by outlet and brand.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) }, { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'outletName', label: 'Outlet' },
      { key: 'brandName', label: 'Brand' },
      { key: 'itemCount', label: 'Product Count' },
      { key: 'totalSales', label: 'Total', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` },
    ],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.brandWise(campaignId, query)),
  },

  clientReports: {
    title: 'Client Reports', subtitle: 'Item-wise sales, scoped to your outlets.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) }],
    columns: [{ key: 'itemName', label: 'Product' }, { key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Product Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.skuWise(campaignId, query)),
  },

  brandWiseClient: {
    title: 'Brand Wise', subtitle: 'Brand-wise sales, scoped to your outlets.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) }, { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'outletName', label: 'Outlet' },
      { key: 'brandName', label: 'Brand' },
      { key: 'itemCount', label: 'Sold Qty' },
      { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` },
    ],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.brandWise(campaignId, query)),
  },

  reorder: {
    title: 'Reorder', subtitle: 'Products at or below their reorder level, per outlet.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'brandId', label: 'Brand', type: 'searchable-select', allLabel: 'All brands', optionsLoader: () => optionsFrom(brandsApi.list) },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    columns: [
      { key: 'activationName', label: 'Activation' }, { key: 'itemName', label: 'Product' },
      { key: 'brandName', label: 'Brand', render: (r) => r.brandName || '—' },
      { key: 'outletName', label: 'Outlet' }, { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'remainingStock', label: 'Remaining' },
    ],
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.reorder(campaignId, query)),
  },

  users: {
    title: 'Users', subtitle: 'Back-office logins for the web portal (Admin / Supervisor / Sponsor).', addLabel: 'Add User',
    columns: [
      { key: 'displayName', label: 'Display Name', render: (r) => <Avatar name={r.displayName} /> },
      { key: 'email', label: 'Email' }, { key: 'username', label: 'Username' },
      { key: 'roleId', label: 'User Role', render: (r) => <Badge type="info">{r.roleId}</Badge> },
      { key: 'createdAt', label: 'Created At' },
      { key: 'isActive', label: 'Is Active', render: (r) => <Badge type={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    ],
    actions: ['edit'],
    fetchList: ({ query }) => usersApi.list(query),
    createItem: ({ values }) => usersApi.create(values),
    updateItem: ({ id, values }) => {
      const { password, ...rest } = values;
      const body = password ? { ...rest, password } : rest;
      return usersApi.update(id, body);
    },
    formFields: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'text', required: true, resettable: true, placeholder: 'Set initial password' },
      { key: 'displayName', label: 'Display Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'roleId', label: 'User Role', type: 'searchable-select', required: true, optionsLoader: () => optionsFrom(rolesApi.list, 'label', 'id') },
      { key: 'isActive', label: 'Is Active', type: 'radio', options: [{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }] },
    ],
  },

  outletWise: {
    title: 'Outlet Wise', subtitle: 'Sales rollup by outlet, for the selected date range.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'outletId', label: 'Outlet', type: 'searchable-select', allLabel: 'All outlets', optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'dateFrom', label: 'From', type: 'date', defaultToday: true },
      { key: 'dateTo', label: 'To', type: 'date', defaultToday: true },
    ],
    // Columns depend on the campaign's own day-scope custom sales fields
    // (meta.customFieldDefs), so this is resolved per-load rather than static.
    // Non-number custom fields show the latest value in the range, not a sum —
    // labeled "(current)" so that's not mistaken for a range total.
    columns: (meta) => [
      { key: 'outletName', label: 'Outlet' },
      { key: 'footFall', label: 'Footfall' },
      { key: 'approached', label: 'Approach' },
      {
        key: 'converted', label: 'Conversion',
        render: (r) => (r.approached > 0 ? `${Math.round((r.converted / r.approached) * 1000) / 10}%` : '—'),
        csvValue: (r) => (r.approached > 0 ? Math.round((r.converted / r.approached) * 1000) / 10 : 0),
      },
      ...(meta.customFieldDefs || []).map((d) => ({
        key: d.key,
        label: d.type === 'number' ? d.label : `${d.label} (current)`,
        render: d.type === 'boolean' ? (r) => (r[d.key] === true ? 'Yes' : r[d.key] === false ? 'No' : '—') : undefined,
      })),
      { key: 'totalSales', label: 'Total Sale', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` },
      { key: 'target', label: 'Target' },
      { key: 'achievementPct', label: 'Achievement %', render: (r) => `${r.achievementPct ?? 0}%` },
    ],
    emptyHint: 'No sales or footfall recorded for the selected scope yet.',
    fetchList: clientPaged(({ campaignId, query }) => reportsApi.outletWise(campaignId, query)),
  },

  promoterTracking: {
    title: 'Promoter Tracking', subtitle: 'GPS breadcrumb trail while checked in.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'staffId', label: 'Promoter', type: 'searchable-select', allLabel: 'All Promoters', optionsLoader: staffOptions },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    renderExtra: (rows, selectedRow) => (
      <Suspense fallback={null}><PromoterTrailMap rows={rows} highlightedStaffId={selectedRow?.staffId ?? null} highlightedPingId={selectedRow?.id ?? null} /></Suspense>
    ),
    columns: [
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'outletName', label: 'Outlet' },
      { key: 'capturedAt', label: 'Time', render: (r) => fmtTime(r.capturedAt) },
    ],
    fetchList: ({ campaignId, query }) => trackingApi.promoterHistory(campaignId, query),
  },

  supervisorTracking: {
    title: 'Supervisor Tracking', subtitle: 'GPS breadcrumb trail for supervisors.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'staffId', label: 'Supervisor', type: 'searchable-select', allLabel: 'All Supervisors', optionsLoader: staffOptions },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    columns: [
      { key: 'staffName', label: 'Supervisor', render: (r) => r.staffName || r.staffId },
      { key: 'outletName', label: 'Outlet' },
      { key: 'capturedAt', label: 'Time', render: (r) => fmtTime(r.capturedAt) },
      { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' },
    ],
    fetchList: ({ campaignId, query }) => trackingApi.supervisorHistory(campaignId, query),
  },

  activationListClient: {
    title: 'Activation List', subtitle: 'Activations for your assigned campaign and outlets.', noAdd: true,
    scopeToCampaign: true,
    columns: [
      { key: 'name', label: 'Activation', render: (r) => <Avatar name={r.name} /> },
      { key: 'outletName', label: 'Outlet', render: (r) => r.outletName || r.outletId },
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'dateFrom', label: 'From', render: (r) => fmtDate(r.dateFrom) },
      { key: 'dateTo', label: 'To', render: (r) => fmtDate(r.dateTo) },
    ],
    actions: ['view'],
    fetchList: ({ campaignId, query }) => activationsApi.list(campaignId, query),
    hydrate: hydrateActivations,
  },

  roles: {
    title: 'Roles', subtitle: 'RBAC — modules, functionality and default landing page per role.', addLabel: 'Add Role',
    columns: [
      { key: 'id', label: 'Id' }, { key: 'label', label: 'Label' }, { key: 'description', label: 'Description' }, { key: 'defaultUrl', label: 'Default URL' },
    ],
    actions: ['edit'],
    fetchList: ({ query }) => rolesApi.list(query),
    createItem: ({ values }) => rolesApi.create(values),
    updateItem: ({ id, values }) => rolesApi.update(id, values),
    formFields: [
      { key: 'id', label: 'Id', type: 'text', required: true, placeholder: 'short code, e.g. supervisor' },
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'defaultUrl', label: 'Default URL', type: 'text', required: true },
      { key: 'isActive', label: 'Is Active', type: 'radio', options: [{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }] },
    ],
  },

};
