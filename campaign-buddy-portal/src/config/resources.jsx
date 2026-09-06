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
  reports as reportsApi, users as usersApi, roles as rolesApi, assumed,
} from '../lib/endpoints';

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
      { key: 'startDate', label: 'From' }, { key: 'endDate', label: 'To' },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'active' ? 'success' : r.status === 'ended' ? 'muted' : 'pending'}>{r.status}</Badge> },
    ],
    actions: ['items', 'edit', 'delete'],
    fetchList: ({ query }) => campaignsApi.list(query),
    hydrate: async (rows) => {
      const clientRes = await clientsApi.list().catch(() => null);
      const map = buildLookup(clientRes?.data, 'clientName');
      return rows.map((r) => ({ ...r, clientName: map[r.clientId] }));
    },
    createItem: ({ values }) => campaignsApi.create({
      campaignNo: values.campaignNo, name: values.name, clientId: values.clientId,
      description: values.description, startDate: values.dateRange?.[0], endDate: values.dateRange?.[1],
    }),
    updateItem: ({ id, values }) => campaignsApi.update(id, values),
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
      { key: 'supervisorName', label: 'Supervisor', render: (r) => r.supervisorName || r.supervisorStaffId },
      { key: 'dateFrom', label: 'From' }, { key: 'dateTo', label: 'To' },
    ],
    actions: ['target', 'items', 'edit', 'delete'],
    fetchList: ({ campaignId, query }) => activationsApi.list(campaignId, query),
    hydrate: hydrateActivations,
    createItem: ({ campaignId, values }) => activationsApi.create(campaignId, {
      name: values.name, outletId: values.outletId, staffId: values.staffId,
      supervisorStaffId: values.supervisorStaffId, distributorPointId: values.distributorPointId || null,
      dateFrom: values.dateRange?.[0], dateTo: values.dateRange?.[1],
      targetType: values.targetType, targetCategorization: values.targetCategorization, targetUnit: values.targetUnit,
    }),
    updateItem: ({ campaignId, id, values }) => activationsApi.update(campaignId, id, values),
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
    title: 'Staff', subtitle: 'Promoters and supervisors across all campaigns.', addLabel: 'Add New Member', addFull: true,
    columns: [
      { key: 'displayName', label: 'Name', render: (r) => <Avatar initials={(r.displayName || '?').slice(0, 2).toUpperCase()} name={r.displayName || r.fullName} sub={r.employeeId} /> },
      { key: 'userType', label: 'Type', render: (r) => <Badge type={r.userType === 'supervisor' ? 'success' : 'info'}>{r.userType}</Badge> },
      { key: 'email', label: 'Email' }, { key: 'cityName', label: 'City', render: (r) => r.cityName || r.cityId },
      { key: 'phone', label: 'Mobile' },
    ],
    actions: ['view', 'edit', 'delete'],
    fetchList: ({ query }) => staffApi.search(query?.search || ''),
    hydrate: async (rows) => {
      const cityRes = await citiesApi.list().catch(() => null);
      const map = buildLookup(cityRes?.data);
      return rows.map((r) => ({ ...r, cityName: map[r.cityId] }));
    },
    createItem: async ({ values }) => {
      // profilePicture is a File object, not JSON — upload it separately
      // once we have a staff id, so POST /staff stays plain JSON.
      const { profilePicture, ...rest } = values;
      const res = await staffApi.create(rest);
      const newId = res?.data?.id;
      if (profilePicture instanceof File && newId) {
        await staffApi.uploadPhoto(newId, profilePicture);
      }
      return res;
    },
    updateItem: async ({ id, values }) => {
      const { profilePicture, ...rest } = values;
      const res = await staffApi.update(id, rest);
      // Only re-upload if the admin actually picked a new file — otherwise
      // `profilePicture` here is just the existing photo URL string coming
      // back from initialValues, not a File.
      if (profilePicture instanceof File) {
        await staffApi.uploadPhoto(id, profilePicture);
      }
      return res;
    },
    deleteItem: ({ id }) => staffApi.remove(id),
    // Full HR record per CampaignBuddy_AdminPanel_Feature_Specification.md §3.5.1
    // and CampaignBuddy_Full_Backend_Contract.md §10.3 (confirmed in scope for v1).
    formFields: [
      { type: 'section', label: 'Basic Info' },
      { key: 'fullName', label: 'Full Name', type: 'text', required: true },
      { key: 'displayName', label: 'Display Name (App Name)', type: 'text', required: true },
      { key: 'gender', label: 'Gender', type: 'radio', required: true, options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
      { key: 'nic', label: 'NIC', type: 'text', required: true, placeholder: 'National ID number' },
      { key: 'profilePicture', label: 'Profile Picture', type: 'upload', required: true },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea', required: true },
      { key: 'currentAddress', label: 'Current Address', type: 'textarea', required: true },
      { key: 'cityId', label: 'City', type: 'select', required: true, optionsLoader: () => optionsFrom(citiesApi.list) },
      { key: 'telephone', label: 'Telephone', type: 'text' },
      { key: 'phone', label: 'Mobile', type: 'text', required: true },
      { key: 'mobileType', label: 'Mobile Type', type: 'radio', required: true, options: [{ value: 'smart', label: 'Smart' }, { value: 'normal', label: 'Normal' }] },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'maritalStatus', label: 'Marital Status', type: 'radio', options: [{ value: 'non_married', label: 'Non-Married' }, { value: 'married', label: 'Married' }] },

      { type: 'section', label: 'Emergency Contact Details' },
      { key: 'emergencyContactName', label: 'Contact Name', type: 'text', required: true },
      { key: 'emergencyContactNo', label: 'Contact No', type: 'text', required: true },

      { type: 'section', label: 'Bank Account Details' },
      { key: 'bankAccountName', label: 'Account Name', type: 'text', required: true },
      { key: 'bankName', label: 'Bank', type: 'text', required: true },
      { key: 'bankAccountNumber', label: 'Account Number', type: 'text', required: true },
      { key: 'bankBranch', label: 'Branch', type: 'text', required: true },

      { type: 'section', label: 'Skills and Qualifications' },
      { key: 'educationQualification', label: 'Education Qualification', type: 'textarea' },
      { key: 'workExperience', label: 'Work Experience', type: 'textarea' },
      { key: 'otherSkills', label: 'Other Skills', type: 'textarea' },
      { key: 'interestsHobbies', label: 'Interests / Hobbies', type: 'textarea' },
      { key: 'englishSpeaking', label: 'English Speaking', type: 'radio', options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'poor', label: 'Poor' }] },
      { key: 'englishReading', label: 'English Reading', type: 'radio', options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'poor', label: 'Poor' }] },
      { key: 'englishWriting', label: 'English Writing', type: 'radio', options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'poor', label: 'Poor' }] },

      { type: 'section', label: 'Work Details' },
      { key: 'workingType', label: 'Working Type', type: 'radio', required: true, options: [{ value: 'weekdays_only', label: 'Weekdays Only' }, { value: 'daily', label: 'Daily' }, { value: 'outstation', label: 'Outstation' }] },
      { key: 'supplierName', label: 'Supplier Name', type: 'text', placeholder: 'Optional — links this promoter to a distributor/supplier' },
      { key: 'mobileUsername', label: 'Mobile App Username', type: 'text', required: true, placeholder: 'lowercase, no spaces or special characters' },
      { key: 'designation', label: 'Designation', type: 'creatable', required: true, options: ['Category Assistant', 'Beauty Category Assistant', 'Supervisor'] },
      { key: 'userType', label: 'User Type', type: 'radio', required: true, options: [{ value: 'promoter', label: 'Promoter' }, { value: 'supervisor', label: 'Supervisor' }] },
      { key: 'status', label: 'Status', type: 'radio', required: true, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
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
      { key: 'userId', label: 'Promoter' }, { key: 'date', label: 'Date' },
      { key: 'checkInAt', label: 'Check-in Time' }, { key: 'checkOutAt', label: 'Check-out Time' },
      { key: 'status', label: 'Status', render: (r) => <Badge type={r.status === 'on_time' ? 'success' : r.status === 'late' ? 'pending' : 'muted'}>{r.status}</Badge> },
    ],
    fetchList: ({ campaignId, query }) => attendanceApi.list(campaignId, query),
  },

  staffAbsence: {
    title: 'Staff Absence', subtitle: 'Promoters scheduled but not checked in for the selected date.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [{ key: 'activationName', label: 'Activation' }, { key: 'outletName', label: 'Outlet' }, { key: 'staffName', label: 'Promoter' }],
    fetchList: ({ campaignId, query }) => assumed.staffAbsence(campaignId, query?.date),
    emptyHint: 'No absences recorded for this date.',
  },

  leaveRequests: {
    title: 'Leave Requests', subtitle: 'Time-off submitted from the mobile app.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'dateFrom', label: 'From', type: 'date' }, { key: 'dateTo', label: 'To', type: 'date' }],
    columns: [
      { key: 'userId', label: 'Employee' }, { key: 'fromDate', label: 'From' }, { key: 'toDate', label: 'To' },
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
    fetchList: ({ campaignId }) => assumed.supervisorTasks.list(campaignId),
    createItem: ({ campaignId, values }) => assumed.supervisorTasks.create(campaignId, values),
    updateItem: ({ campaignId, id, values }) => assumed.supervisorTasks.update(campaignId, id, values),
    deleteItem: ({ campaignId, id }) => assumed.supervisorTasks.remove(campaignId, id),
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
      { key: 'supervisorName', label: 'Supervisor' }, { key: 'staffName', label: 'Promoter' }, { key: 'outletName', label: 'Outlet' },
      { key: 'checkInAt', label: 'Check-in Time' }, { key: 'checkOutAt', label: 'Check-out Time' },
    ],
    fetchList: ({ campaignId, query }) => assumed.outletAttendance(campaignId, query),
  },

  supervisorAttendance: {
    title: 'Supervisor Attendance', subtitle: "Supervisors' own check-in log.", excel: true, noAdd: true,
    scopeToCampaign: true,
    columns: [{ key: 'userId', label: 'Supervisor' }, { key: 'checkInAt', label: 'Check-in Time' }, { key: 'checkOutAt', label: 'Check-out Time' }],
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
      { key: 'activationItemId', label: 'Item' }, { key: 'date', label: 'Date' },
      { key: 'openingStock', label: 'Start Qty' }, { key: 'soldToday', label: 'Sold Qty' },
      { key: 'remainingStock', label: 'Remaining' },
    ],
    fetchList: ({ campaignId, query }) => salesRecordsApi.list(campaignId, query),
  },

  salesStatus: {
    title: 'Sales Update Status', subtitle: "Daily submission-compliance — did each promoter submit today's sales.", noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [
      { key: 'activationId', label: 'Activation' }, { key: 'outletId', label: 'Outlet' },
      { key: 'footFall', label: 'Foot Fall' },
      { key: 'updatedAt', label: 'Status', render: (r) => <Badge type={r.updatedAt ? 'success' : 'alert'}>{r.updatedAt ? 'Completed' : 'Missing'}</Badge> },
    ],
    fetchList: ({ campaignId, query }) => dailyStatsApi.list(campaignId, query),
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
    fetchList: ({ campaignId, query }) => assumed.clientScopedReports.skuWise(campaignId, query),
  },

  brandWiseClient: {
    title: 'Overall Brand Wise', subtitle: 'Brand-wise sales, scoped to your outlets.', excel: true, noAdd: true,
    scopeToCampaign: true,
    columns: [{ key: 'brandName', label: 'Product Brand' }, { key: 'itemCount', label: 'Item Count' }, { key: 'totalSales', label: 'Total Sales', render: (r) => `LKR ${Number(r.totalSales || 0).toLocaleString()}` }],
    fetchList: ({ campaignId, query }) => assumed.clientScopedReports.brandWise(campaignId, query),
  },

  reorder: {
    title: 'Reorder', subtitle: 'Items at or below their reorder level, per outlet.', excel: true, noAdd: true,
    scopeToCampaign: true,
    filters: [{ key: 'date', label: 'Date', type: 'date' }],
    columns: [{ key: 'activationName', label: 'Activation' }, { key: 'itemName', label: 'Item' }, { key: 'outletName', label: 'Outlet' }, { key: 'date', label: 'Date' }],
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
    emptyHint: 'Select an outlet and duration above, then Load, to view the outlet-wise breakdown.',
    // Unified spec has no dedicated outlet-rollup endpoint — this derives the
    // rollup client-side from DailyStats. Swap for a real /reports/outlet-wise
    // endpoint once the backend adds one; grouping this much data client-side
    // won't scale past a small campaign.
    fetchList: async ({ campaignId, query }) => {
      if (!query?.outletId) return { data: [], meta: { total: 0 } };
      const res = await dailyStatsApi.list(campaignId, query);
      const rows = res?.data || [];
      const outletRes = await outletsApi.list().catch(() => null);
      const outletMap = buildLookup(outletRes?.data);
      const grouped = {};
      rows.forEach((r) => {
        const key = r.outletId || 'unknown';
        grouped[key] = grouped[key] || { outletId: key, outletName: outletMap[key] || key, footFall: 0, totalSales: 0 };
        grouped[key].footFall += r.footFall || 0;
        grouped[key].totalSales += r.totalSales || 0;
      });
      const data = Object.values(grouped);
      return { data, meta: { total: data.length } };
    },
  },

  promoterTracking: {
    title: 'Promoter Tracking', subtitle: 'GPS breadcrumb trail while checked in.', noAdd: true,
    scopeToCampaign: true,
    filters: [
      { key: 'staffId', label: 'Promoter', type: 'select', optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    columns: [{ key: 'staffId', label: 'Promoter' }, { key: 'capturedAt', label: 'Time' }, { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' }],
    fetchList: ({ campaignId, query }) => assumed.promoterTrackingHistory(campaignId, query),
  },

  supervisorTracking: {
    title: 'Supervisor Tracking', subtitle: 'GPS breadcrumb trail for supervisors.', noAdd: true,
    filters: [
      { key: 'staffId', label: 'Supervisor', type: 'select', optionsLoader: () => optionsFrom(() => staffApi.search(''), 'displayName') },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    columns: [{ key: 'staffId', label: 'Supervisor' }, { key: 'capturedAt', label: 'Time' }, { key: 'latitude', label: 'Latitude' }, { key: 'longitude', label: 'Longitude' }],
    fetchList: ({ query }) => assumed.supervisorTrackingHistory(query),
  },

  activationListClient: {
    title: 'Activation List', subtitle: 'Activations for your assigned campaign and outlets.', noAdd: true,
    scopeToCampaign: true,
    columns: [
      { key: 'name', label: 'Activation', render: (r) => <Avatar name={r.name} /> },
      { key: 'outletName', label: 'Outlet', render: (r) => r.outletName || r.outletId },
      { key: 'staffName', label: 'Promoter', render: (r) => r.staffName || r.staffId },
      { key: 'dateFrom', label: 'From' }, { key: 'dateTo', label: 'To' },
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
