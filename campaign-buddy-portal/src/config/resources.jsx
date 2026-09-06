// Config-driven list/CRUD pages. Each entry here is rendered by
// pages/ResourcePage.jsx. Anything too bespoke for a table (Dashboard,
// live map, calendars, the evaluation screen, Update Sales) has its own
// page component instead — see App.jsx for the full route map.
//
// `fetchList({ campaignId, query })` must resolve to `{ data, meta }`
// matching CampaignBuddy_API_Spec.md §1.1's list envelope.
// `hydrate(rows)` is optional client-side joining (e.g. attach a clientName
// onto a Campaign row) for endpoints that return bare foreign keys.
import Badge from '../components/Badge';
import Avatar from '../components/Avatar';
import {
  clients as clientsApi, brands as brandsApi, items as itemsApi, outlets as outletsApi,
  distributorPoints as distributorPointsApi, cities as citiesApi, campaigns as campaignsApi,
  staff as staffApi, activations as activationsApi, attendance as attendanceApi,
  salesRecords as salesRecordsApi, dailyStats as dailyStatsApi, leaveRequests as leaveRequestsApi,
  reports as reportsApi, users as usersApi, roles as rolesApi,
  supervisorTasks as supervisorTasksApi, staffAbsence as staffAbsenceApi,
  outletAttendance as outletAttendanceApi, tracking as trackingApi,
} from '../lib/endpoints';

// @db.Date columns come back as "…T00:00:00.000Z"; render them in UTC so a
// negative-offset browser doesn't show the previous day. Timestamps (checkInAt,
// capturedAt, …) are real instants and render in local time.
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '');
const fmtTime = (v) => (v ? new Date(v).toLocaleString() : '—');
const fmtISO = (v) => (v ? new Date(v).toISOString().slice(0, 10) : ''); // for <input type="date">
const nameOf = (s) => s?.displayName || s?.fullName || '';

const PROVINCES = ['Western', 'Eastern', 'Central', 'Southern', 'Sabaragamuwa', 'North Western', 'Northern', 'Uva', 'North Central'];
const DISTRICTS = ['Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
  'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee', 'Kurunegala',
  'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle'];

async function optionsFrom(listFn, labelKey = 'name', valueKey = 'id') {
  const res = await listFn();
  return (res?.data || []).map((r) => ({ value: r[valueKey], label: r[labelKey] || r.fullName || r.displayName || r[valueKey] }));
}

function buildLookup(rows, labelKey = 'name') {
  const map = {};
  (rows || []).forEach((r) => { map[r.id] = r[labelKey] || r.fullName || r.displayName; });
  return map;
}

async function hydrateActivations(rows) {
  const [outletRes, staffRes] = await Promise.all([outletsApi.list().catch(() => null), staffApi.search('').catch(() => null)]);
  const outletMap = buildLookup(outletRes?.data);
  const staffMap = buildLookup(staffRes?.data, 'displayName');
  return rows.map((r) => ({ ...r, outletName: outletMap[r.outletId], staffName: staffMap[r.staffId], supervisorName: staffMap[r.supervisorStaffId] }));
}

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
      contactNumber: values.contactNumber, email: values.email, address: values.address,
    }),
    updateItem: ({ id, values }) => clientsApi.update(id, values),
    deleteItem: ({ id }) => clientsApi.remove(id),
    formFields: [
      { key: 'companyName', label: 'Company', type: 'text', required: true, placeholder: 'e.g. Prisha Naturals (Pvt) Ltd' },
      { key: 'clientName', label: 'Client Name', type: 'text', required: true, placeholder: 'Primary contact name' },
      { key: 'contactNumber', label: 'Contact Number', type: 'text', required: true, placeholder: '+94 71 234 5678' },
      { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'name@company.lk' },
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
  },

  brands: {
    title: 'Brands', subtitle: 'Brand catalog, owned by clients.', addLabel: 'Add New Brand',
    columns: [
      { key: 'name', label: 'Brand Name', render: (r) => <Avatar name={r.name} /> },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => brandsApi.list(query),
    createItem: ({ values }) => brandsApi.create({ name: values.name, clientId: values.clientId }),
    updateItem: ({ id, values }) => brandsApi.update(id, { name: values.name, clientId: values.clientId }),
    deleteItem: ({ id }) => brandsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Brand Name', type: 'text', required: true },
      { key: 'clientId', label: 'Client', type: 'select', required: true, optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
    ],
  },

  items: {
    title: 'Items', subtitle: 'Catalog-level products, shared across campaigns.', addLabel: 'Add New Item',
    columns: [
      { key: 'name', label: 'Item', render: (r) => <Avatar name={r.name} sub={r.sku} /> },
      { key: 'brandName', label: 'Brand', render: (r) => r.brandName || r.brandId },
      { key: 'description', label: 'Description' },
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
    createItem: ({ values }) => itemsApi.create({
      name: values.name, brandId: values.brandId, description: values.description,
      unitPrice: Number(values.unitPrice) || 0, reorderLevel: Number(values.reorderLevel) || 0,
    }),
    updateItem: ({ id, values }) => itemsApi.update(id, {
      name: values.name, brandId: values.brandId, description: values.description,
      unitPrice: Number(values.unitPrice) || 0, reorderLevel: Number(values.reorderLevel) || 0,
    }),
    deleteItem: ({ id }) => itemsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Item Name', type: 'text', required: true },
      { key: 'brandId', label: 'Brand', type: 'select', required: true, optionsLoader: () => optionsFrom(brandsApi.list) },
      { key: 'shortDescription', label: 'Short Description', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'unitPrice', label: 'Price (LKR)', type: 'text', required: true },
      { key: 'reorderLevel', label: 'Re-order Level', type: 'text', required: true },
      { key: 'image', label: 'Image', type: 'upload' },
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
      name: values.name, contactPerson: values.contactPerson, address: values.address, cityId: values.cityId,
      phone: values.phone, mobile: values.mobile, fax: values.fax,
      latitude: Number(values.geo?.lat), longitude: Number(values.geo?.lng),
    }),
    updateItem: ({ id, values }) => outletsApi.update(id, {
      name: values.name, contactPerson: values.contactPerson, address: values.address, cityId: values.cityId,
      phone: values.phone, mobile: values.mobile, fax: values.fax,
      latitude: Number(values.geo?.lat), longitude: Number(values.geo?.lng),
    }),
    deleteItem: ({ id }) => outletsApi.remove(id),
    formFields: [
      { key: 'name', label: 'Outlet Name', type: 'text', required: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea', required: true },
      { key: 'cityId', label: 'City', type: 'select', required: true, optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'mobile', label: 'Mobile', type: 'text' },
      { key: 'fax', label: 'Fax', type: 'text' },
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
      { key: 'cityId', label: 'City', type: 'select', optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'clientId', label: 'Client', type: 'select', optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
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
      { key: 'province', label: 'Province', type: 'select', required: true, options: PROVINCES },
      { key: 'district', label: 'District', type: 'select', required: true, options: DISTRICTS },
    ],
  },

  campaigns: {
    title: 'Campaigns', subtitle: 'All campaigns run for your clients.', addLabel: 'Add New Campaign',
    columns: [
      { key: 'name', label: 'Name', render: (r) => <Avatar name={r.name} sub={r.campaignNo} /> },
      { key: 'clientName', label: 'Client', render: (r) => r.clientName || r.clientId },
      { key: 'startDate', label: 'From', render: (r) => fmtDate(r.startDate) },
      { key: 'endDate', label: 'To', render: (r) => fmtDate(r.endDate) },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'active' ? 'success' : r.status === 'ended' ? 'muted' : 'pending'}>{r.status}</Badge> },
    ],
    actions: ['items', 'edit', 'delete'],
    fetchList: ({ query }) => campaignsApi.list(query),
    hydrate: async (rows) => {
      const clientRes = await clientsApi.list().catch(() => null);
      const map = buildLookup(clientRes?.data, 'clientName');
      return rows.map((r) => ({ ...r, clientName: map[r.clientId] }));
    },
    editValues: (row) => ({
      campaignNo: row.campaignNo, name: row.name, clientId: row.clientId,
      description: row.description, dateRange: [fmtISO(row.startDate), fmtISO(row.endDate)],
    }),
    createItem: ({ values }) => campaignsApi.create({
      campaignNo: values.campaignNo, name: values.name, clientId: values.clientId,
      description: values.description, startDate: values.dateRange?.[0], endDate: values.dateRange?.[1],
    }),
    updateItem: ({ id, values }) => campaignsApi.update(id, {
      campaignNo: values.campaignNo, name: values.name, clientId: values.clientId,
      description: values.description,
      ...(values.dateRange?.[0] ? { startDate: values.dateRange[0] } : {}),
      ...(values.dateRange?.[1] ? { endDate: values.dateRange[1] } : {}),
    }),
    deleteItem: ({ id }) => campaignsApi.remove(id),
    formFields: [
      { key: 'campaignNo', label: 'Campaign No', type: 'text', required: true, placeholder: 'CMP-0234' },
      { key: 'name', label: 'Campaign Name', type: 'text', required: true },
      { key: 'clientId', label: 'Client', type: 'select', required: true, optionsLoader: () => optionsFrom(clientsApi.list, 'clientName') },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
    ],
    itemsRoute: (row) => `/campaigns/${row.id}/items`,
  },

  activations: {
    title: 'Activations', subtitle: 'Field-rep assignments to a campaign + outlet.', addLabel: 'Add New Activation',
    scopeToCampaign: true,
    columns: [
      { key: 'name', label: 'Activation', render: (r) => <Avatar name={r.name} /> },
      { key: 'outletName', label: 'Outlet', render: (r) => r.outletName || r.outletId },
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'supervisorName', label: 'Supervisor', render: (r) => r.supervisorName || r.supervisorStaffId || '—' },
      { key: 'dateFrom', label: 'From', render: (r) => fmtDate(r.dateFrom) },
      { key: 'dateTo', label: 'To', render: (r) => fmtDate(r.dateTo) },
    ],
    actions: ['target', 'items', 'edit', 'delete'],
    fetchList: ({ campaignId, query }) => activationsApi.list(campaignId, query),
    hydrate: hydrateActivations,
    editValues: (row) => ({
      name: row.name, outletId: row.outletId, staffId: row.staffId,
      supervisorStaffId: row.supervisorStaffId, distributorPointId: row.distributorPointId,
      dateRange: [fmtISO(row.dateFrom), fmtISO(row.dateTo)],
      targetType: row.targetType, targetCategorization: row.targetCategorization, targetUnit: row.targetUnit,
    }),
    createItem: ({ campaignId, values }) => activationsApi.create(campaignId, {
      name: values.name, outletId: values.outletId, staffId: values.staffId,
      supervisorStaffId: values.supervisorStaffId, distributorPointId: values.distributorPointId || null,
      dateFrom: values.dateRange?.[0], dateTo: values.dateRange?.[1],
      targetType: values.targetType, targetCategorization: values.targetCategorization, targetUnit: values.targetUnit,
    }),
    updateItem: ({ campaignId, id, values }) => activationsApi.update(campaignId, id, {
      name: values.name, outletId: values.outletId, staffId: values.staffId,
      supervisorStaffId: values.supervisorStaffId, distributorPointId: values.distributorPointId || null,
      ...(values.dateRange?.[0] ? { dateFrom: values.dateRange[0] } : {}),
      ...(values.dateRange?.[1] ? { dateTo: values.dateRange[1] } : {}),
      targetType: values.targetType, targetCategorization: values.targetCategorization, targetUnit: values.targetUnit,
    }),
    deleteItem: ({ campaignId, id }) => activationsApi.remove(campaignId, id),
    formFields: [
      { key: 'name', label: 'Activation Name', type: 'text', required: true },
      { key: 'outletId', label: 'Outlet', type: 'select', required: true, optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'staffId', label: 'Promoter', type: 'select', required: true, optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
      { key: 'supervisorStaffId', label: 'Supervisor', type: 'select', required: true, optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
      { key: 'distributorPointId', label: 'Distributor Point', type: 'select', optionsLoader: () => optionsFrom(distributorPointsApi.list) },
      { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
      { key: 'targetType', label: 'Target Type', type: 'radio', options: [{ value: 'item_wise', label: 'Item Wise' }, { value: 'brand_wise', label: 'Brand Wise' }] },
      { key: 'targetCategorization', label: 'Target Categorization', type: 'radio', options: [{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }] },
      { key: 'targetUnit', label: 'Target Unit', type: 'radio', options: [{ value: 'unit_wise', label: 'Unit Wise' }, { value: 'sales_wise', label: 'Sales Wise' }] },
    ],
    targetRoute: (row, campaignId) => `/campaigns/${campaignId}/activations/${row.id}/targets`,
    itemsRoute: (row, campaignId) => `/campaigns/${campaignId}/activations/${row.id}/items`,
  },

  staff: {
    title: 'Staff', subtitle: 'Promoters and supervisors across all campaigns.', addLabel: 'Add New Member',
    columns: [
      { key: 'displayName', label: 'Name', render: (r) => <Avatar initials={(r.displayName || '?').slice(0, 2).toUpperCase()} name={r.displayName || r.fullName} sub={r.employeeId} /> },
      { key: 'userType', label: 'Type', render: (r) => <Badge type={r.userType === 'supervisor' ? 'success' : 'info'}>{r.userType}</Badge> },
      { key: 'mobileUsername', label: 'App Username' },
      { key: 'cityName', label: 'City', render: (r) => r.cityName || r.cityId || '—' },
      { key: 'phone', label: 'Mobile' },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge> },
    ],
    actions: ['edit', 'delete'],
    fetchList: ({ query }) => staffApi.search(query?.search || ''),
    hydrate: async (rows) => {
      const cityRes = await citiesApi.list().catch(() => null);
      const map = buildLookup(cityRes?.data);
      return rows.map((r) => ({ ...r, cityName: map[r.cityId] }));
    },
    editValues: (row) => ({
      ...row,
      dateOfBirth: row.dateOfBirth ? fmtISO(row.dateOfBirth) : '',
    }),
    createItem: ({ values }) => staffApi.create(values),
    updateItem: ({ id, values }) => staffApi.update(id, values),
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
      { key: 'nic', label: 'NIC', type: 'text', placeholder: 'National ID number' },
      { key: 'phone', label: 'Mobile', type: 'text' },
      { key: 'cityId', label: 'City', type: 'select', optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea' },
      { key: 'currentAddress', label: 'Current Address', type: 'textarea' },

      { type: 'section', label: 'Login' },
      { key: 'mobileUsername', label: 'Mobile App Username', type: 'text', required: true, placeholder: 'lowercase, no spaces' },
      { key: 'password', label: 'Password', type: 'text', placeholder: 'Set on create; leave blank on edit to keep' },

      { type: 'section', label: 'Emergency Contact' },
      { key: 'emergencyContactName', label: 'Contact Name', type: 'text' },
      { key: 'emergencyContactPhone', label: 'Contact Phone', type: 'text' },

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
      { key: 'outletId', label: 'Outlet', type: 'select', optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' },
    ],
    columns: [
      { key: 'staffName', label: 'Promoter', render: (r) => nameOf(r.activation?.staff) || r.activation?.staff?.fullName || '—' },
      { key: 'outletName', label: 'Outlet', render: (r) => r.activation?.outlet?.name || '—' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'checkInAt', label: 'Check-in', render: (r) => fmtTime(r.checkInAt) },
      { key: 'checkOutAt', label: 'Check-out', render: (r) => fmtTime(r.checkOutAt) },
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
      return staffAbsenceApi.list(campaignId, { date: query.date });
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
    fetchList: ({ campaignId }) => supervisorTasksApi.list(campaignId),
    createItem: ({ campaignId, values }) => supervisorTasksApi.create(campaignId, values),
    updateItem: ({ campaignId, id, values }) => supervisorTasksApi.update(campaignId, id, values),
    deleteItem: ({ campaignId, id }) => supervisorTasksApi.remove(campaignId, id),
    formFields: [
      { key: 'category', label: 'Category', type: 'select', required: true, options: ['Sale', 'Outlet PR', 'Documentation', 'Discipline', 'Competitor Activities', 'Communication', 'Capability / Knowledge', 'Attitude', 'Attire & Grooming'] },
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
    fetchList: ({ query }) => staffApi.search(query?.search || ''),
  },

  skuSales: {
    title: 'SKU Wise Sales', subtitle: 'Raw per-item, per-promoter sales log.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'select', optionsLoader: () => optionsFrom(outletsApi.list) }, { key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'itemName', label: 'Item', render: (r) => r.activationItem?.campaignItem?.item?.name || '—' },
      { key: 'outletName', label: 'Outlet', render: (r) => r.activationItem?.activation?.outlet?.name || '—' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'openingStock', label: 'Start Qty' }, { key: 'soldToday', label: 'Sold Qty' },
      { key: 'remainingStock', label: 'Remaining', render: (r) => (r.openingStock ?? 0) - (r.soldToday ?? 0) },
    ],
    fetchList: ({ campaignId, query }) => salesRecordsApi.list(campaignId, query),
  },

  salesStatus: {
    title: 'Sales Update Status', subtitle: "Daily submission-compliance — did each promoter submit today's sales.", noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'activationName', label: 'Activation' }, { key: 'outletName', label: 'Outlet' },
      { key: 'footFall', label: 'Foot Fall' },
      { key: 'updatedAt', label: 'Status', render: (r) => <Badge type={r.updatedAt ? 'success' : 'alert'}>{r.updatedAt ? 'Completed' : 'Missing'}</Badge> },
    ],
    fetchList: async ({ campaignId, query }) => {
      const res = await dailyStatsApi.list(campaignId, query);
      const rows = res?.data?.byDay || [];
      return { data: rows, meta: { total: rows.length } };
    },
  },

  reportSkuWise: {
    title: 'Overall SKU Wise', subtitle: 'Aggregated sales by item, across the campaign.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [{ key: 'itemName', label: 'Item' }, { key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Item Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: ({ campaignId, query }) => reportsApi.skuWise(campaignId, query),
  },

  reportBrandWise: {
    title: 'Overall Brand Wise', subtitle: 'Aggregated sales by brand.', excel: true, noAdd: true,
    scopeToCampaign: true,
    columns: [{ key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Item Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: ({ campaignId, query }) => reportsApi.brandWise(campaignId, query),
  },

  clientReports: {
    title: 'Client Reports', subtitle: 'Item-wise sales, scoped to your outlets.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'outletId', label: 'Outlet', type: 'select', optionsLoader: () => optionsFrom(outletsApi.list) }],
    columns: [{ key: 'itemName', label: 'Item' }, { key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Item Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: ({ campaignId, query }) => reportsApi.skuWise(campaignId, query),
  },

  brandWiseClient: {
    title: 'Overall Brand Wise', subtitle: 'Brand-wise sales, scoped to your outlets.', excel: true, noAdd: true,
    scopeToCampaign: true,
    columns: [{ key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Item Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: ({ campaignId, query }) => reportsApi.brandWise(campaignId, query),
  },

  reorder: {
    title: 'Reorder', subtitle: 'Items at or below their reorder level, per outlet.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'activationName', label: 'Activation' }, { key: 'itemName', label: 'Item' },
      { key: 'outletName', label: 'Outlet' }, { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
      { key: 'remainingStock', label: 'Remaining' },
    ],
    fetchList: ({ campaignId, query }) => reportsApi.reorder(campaignId, query),
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
    updateItem: ({ id, values }) => usersApi.update(id, values),
    formFields: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'text', required: true },
      { key: 'displayName', label: 'Display Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'roleId', label: 'User Role', type: 'select', required: true, optionsLoader: () => optionsFrom(rolesApi.list, 'label', 'id') },
      { key: 'isActive', label: 'Is Active', type: 'radio', options: [{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }] },
    ],
  },

  outletWise: {
    title: 'Outlet Wise', subtitle: 'Sales rollup by outlet.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'outletId', label: 'Outlet', type: 'select', optionsLoader: () => optionsFrom(outletsApi.list) },
      { key: 'duration', label: 'Duration', type: 'select', options: ['Daily', 'Weekly', 'Monthly'] },
    ],
    columns: [{ key: 'outletName', label: 'Outlet' }, { key: 'footFall', label: 'Foot Fall' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    emptyHint: 'No sales or footfall recorded for the selected scope yet.',
    fetchList: ({ campaignId, query }) => reportsApi.outletWise(campaignId, query),
  },

  promoterTracking: {
    title: 'Promoter Tracking', subtitle: 'GPS breadcrumb trail while checked in.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'staffId', label: 'Promoter', type: 'select', optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    columns: [
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'outletName', label: 'Outlet' },
      { key: 'capturedAt', label: 'Time', render: (r) => fmtTime(r.capturedAt) },
      { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' },
    ],
    fetchList: ({ campaignId, query }) => trackingApi.promoterHistory(campaignId, query),
  },

  supervisorTracking: {
    title: 'Supervisor Tracking', subtitle: 'GPS breadcrumb trail for supervisors.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'staffId', label: 'Supervisor', type: 'select', optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
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
