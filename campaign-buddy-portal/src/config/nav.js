// Sidebar structure. `roles` = which personas (see AuthContext.roleToPersona)
// see this item at all. Generic list/CRUD pages are driven by config/resources.js
// via ResourcePage; a few screens are bespoke (see App.jsx routes).
export const NAV = [
  { section: null, items: [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'supervisor', 'sponsor'] },
  ]},
  { section: 'Client & Catalog', roles: ['admin'], items: [
    { path: '/clients', label: 'Clients', icon: 'clients', roles: ['admin'] },
    { label: 'Products', icon: 'items', roles: ['admin'], children: [
      { path: '/items', label: 'List' },
      { path: '/brands', label: 'Brands' },
      { path: '/reorder', label: 'Reorder' },
    ]},
  ]},
  { section: 'Campaigns', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Campaigns', icon: 'campaigns', roles: ['admin'], children: [
      { path: '/campaigns', label: 'List' },
      { path: '/activations', label: 'Activation' },
    ]},
    { path: '/my-campaigns', label: 'My Campaigns', icon: 'campaigns', roles: ['supervisor'] },
    { path: '/activations/client', label: 'Activation List', icon: 'campaigns', roles: ['sponsor'] },
  ]},
  { section: 'Outlets', roles: ['admin'], items: [
    { label: 'Outlets', icon: 'outlets', roles: ['admin'], children: [
      { path: '/outlets', label: 'List' },
      { path: '/distributors', label: 'Distributor Point' },
      { path: '/cities', label: 'Cities' },
    ]},
  ]},
  { section: 'People', roles: ['admin', 'supervisor'], items: [
    { label: 'Staff', icon: 'staff', roles: ['admin'], children: [
      { path: '/staff', label: 'List' },
      { path: '/staff/attendance', label: 'Attendance' },
      { path: '/staff/absence', label: 'Absence' },
      { path: '/leave-requests', label: 'Leave Requests' },
      { path: '/staff/profiles', label: 'Profiles' },
    ]},
    { label: 'Supervisors', icon: 'supervisors', roles: ['admin'], children: [
      { path: '/supervisor-tasks', label: 'Tasks' },
      { path: '/outlet-attendance', label: 'Outlet Attendance' },
      { path: '/supervisor-attendance', label: 'Attendance' },
      { path: '/assign-routes', label: 'Assign Routes' },
    ]},
    { path: '/my-outlet-attendance', label: 'Outlet Attendance', icon: 'supervisors', roles: ['supervisor'] },
    { path: '/my-leave-requests', label: 'Leave Requests', icon: 'staff', roles: ['supervisor'] },
  ]},
  { section: 'Sales', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { path: '/sales', label: 'Sales Overview', icon: 'sales', roles: ['admin'] },
    { label: 'Sales', icon: 'sales', roles: ['admin'], children: [
      { path: '/sales/sku-wise', label: 'SKU Wise Sales' },
      { path: '/sales/status', label: 'Sales Update Status' },
      { path: '/sales/outlet-wise', label: 'Outlet wise' },
    ]},
    { path: '/sales/update', label: 'Update Sales', icon: 'updatesales', roles: ['admin'] },
    { path: '/sales/custom-fields', label: 'Custom Fields', icon: 'sales', roles: ['admin'] },
    { path: '/sales/sku-wise', label: 'SKU Wise Sales', icon: 'sales', roles: ['supervisor'] },
    { path: '/sponsor/sales', label: 'Sales & Foot Fall', icon: 'sales', roles: ['sponsor'] },
  ]},
  { section: 'Tracking', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Tracking', icon: 'tracking', roles: ['admin'], children: [
      { path: '/tracking/promoter', label: 'Promoter' },
      { path: '/tracking/supervisor', label: 'Supervisor' },
      { path: '/tracking/live', label: 'Seller Live Locations' },
    ]},
    { path: '/tracking/promoter', label: 'Promoter Tracking', icon: 'tracking', roles: ['supervisor'] },
    { path: '/tracking/live', label: 'Seller Live Locations', icon: 'tracking', roles: ['supervisor', 'sponsor'] },
  ]},
  { section: 'Reports', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Reports', icon: 'reports', roles: ['admin'], children: [
      { path: '/reports/sku-wise', label: 'Overall SKU Wise' },
      { path: '/reports/brand-wise', label: 'Overall Brand Wise' },
    ]},
    { label: 'Admin Reports', icon: 'reports', roles: ['admin'], children: [
      { path: '/reports/monthly-attendance', label: 'Monthly Attendance' },
    ]},
    { path: '/reports/client-sku-wise', label: 'Client Reports', icon: 'reports', roles: ['admin', 'sponsor'] },
    { label: 'Statistic Reports', icon: 'reports', roles: ['admin'], children: [
      { path: '/reports/client-sku-wise', label: 'Overall SKU wise' },
      { path: '/reports/client-brand-wise', label: 'Overall Brand Wise' },
    ]},
    { path: '/reports/sku-wise', label: 'Overall Reports', icon: 'reports', roles: ['supervisor'] },
  ]},
  { section: 'Admin', roles: ['admin'], items: [
    { path: '/promoter-list', label: 'Promoter List', icon: 'staff', roles: ['admin'] },
    { path: '/license', label: 'License Usage', icon: 'reports', roles: ['admin'] },
    { path: '/issues', label: 'Issue Reports', icon: 'reports', roles: ['admin'] },
    { path: '/system-status', label: 'System Status', icon: 'reports', roles: ['admin'] },
    { path: '/users', label: 'Users', icon: 'users', roles: ['admin'] },
    { path: '/roles', label: 'Roles', icon: 'roles', roles: ['admin'] },
  ]},
];
