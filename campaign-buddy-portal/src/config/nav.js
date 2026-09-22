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
  ]},
  { section: 'Outlets', roles: ['admin'], items: [
    { label: 'Outlets', icon: 'outlets', roles: ['admin'], children: [
      { path: '/outlets', label: 'List' },
      { path: '/distributors', label: 'Distributor Point' },
      { path: '/cities', label: 'Cities' },
    ]},
  ]},
  { section: 'People', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Staff', icon: 'staff', roles: ['admin'], children: [
      { path: '/staff', label: 'List' },
      { path: '/staff/attendance', label: 'Attendance' },
      { path: '/staff/absence', label: 'Absence' },
      { path: '/reports/monthly-attendance', label: 'Monthly Attendance' },
      { path: '/leave-requests', label: 'Leave Requests' },
      { path: '/staff/profiles', label: 'Profiles' },
    ]},
    { label: 'Supervisors', icon: 'supervisors', roles: ['admin'], children: [
      { path: '/supervisor-tasks', label: 'Tasks' },
      { path: '/supervisor-task-results', label: 'Task Results' },
      { path: '/supervisor-attendance', label: 'Attendance' },
      { path: '/assign-routes', label: 'Assign Routes' },
    ]},
    { path: '/my-outlet-attendance', label: 'Outlet Attendance', icon: 'supervisors', roles: ['supervisor'] },
    { path: '/my-leave-requests', label: 'Leave Requests', icon: 'staff', roles: ['supervisor'] },
    // Outlet checklist results (photos + 1–5 scores) — read-only, outlet-scoped by grant.
    { path: '/supervisor-task-results', label: 'Task Results', icon: 'supervisors', roles: ['supervisor'] },
    // Client role (doc G) — read-only visibility into both attendance logs
    // for their own campaign, same generic outlet-scoping as everyone else.
    { path: '/staff/attendance', label: 'Attendance', icon: 'staff', roles: ['sponsor'] },
    { path: '/supervisor-attendance', label: 'Supervisor Attendance', icon: 'supervisors', roles: ['sponsor'] },
  ]},
  { section: 'Sales', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Sales Overview', icon: 'sales', roles: ['admin'], children: [
      { path: '/sales/sku-wise', label: 'SKU Wise Sales' },
      { path: '/sales/status', label: 'Sales Update Status' },
      { path: '/sales/outlet-wise', label: 'Outlet wise' },
    ]},
    { path: '/sales/update', label: 'Update Sales', icon: 'updatesales', roles: ['admin'] },
    { path: '/sales/custom-fields', label: 'Custom Fields', icon: 'sales', roles: ['admin'] },
    { path: '/sales/sku-wise', label: 'SKU Wise Sales', icon: 'sales', roles: ['supervisor'] },
    // Stock each promoter started the day with (#91) — also the client's starting-stock report.
    { path: '/sales/starting-stock', label: 'Starting Stock', icon: 'sales', roles: ['admin', 'supervisor', 'sponsor'] },
  ]},
  { section: 'Tracking', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Tracking', icon: 'tracking', roles: ['admin'], children: [
      { path: '/tracking/promoter', label: 'Promoter' },
      { path: '/tracking/supervisor', label: 'Supervisor' },
      { path: '/tracking/live', label: 'Seller Live Locations' },
    ]},
    { path: '/tracking/promoter', label: 'Promoter Tracking', icon: 'tracking', roles: ['supervisor', 'sponsor'] },
    { path: '/tracking/supervisor', label: 'Supervisor Tracking', icon: 'tracking', roles: ['sponsor'] },
    { path: '/tracking/live', label: 'Seller Live Locations', icon: 'tracking', roles: ['supervisor', 'sponsor'] },
  ]},
  { section: 'Reports', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Reports', icon: 'reports', roles: ['admin'], children: [
      { path: '/reports/sku-wise', label: 'Overall SKU Wise' },
      { path: '/reports/brand-wise', label: 'Brand Wise' },
    ]},
    { label: 'Client Reports', icon: 'reports', roles: ['sponsor'], children: [
      { path: '/sponsor/sales', label: 'Overall Outlet and SKU Wise' },
      { path: '/reports/client-brand-wise', label: 'Brand Wise' },
    ]},
    { path: '/reports/sku-wise', label: 'Overall Reports', icon: 'reports', roles: ['supervisor'] },
  ]},
  { section: 'Admin', roles: ['admin'], items: [
    { path: '/license', label: 'License Usage', icon: 'reports', roles: ['admin'] },
    { path: '/issues', label: 'Issue Reports', icon: 'reports', roles: ['admin'] },
    { path: '/system-status', label: 'System Status', icon: 'reports', roles: ['admin'] },
    { path: '/users', label: 'Users', icon: 'users', roles: ['admin'] },
    { path: '/roles', label: 'Roles', icon: 'roles', roles: ['admin'] },
  ]},
  // Nav review (2026-09): pages that duplicate another menu item. Kept reachable
  // here (routes untouched) so nothing goes missing unnoticed; once confirmed,
  // delete the entry here and, if the page is now unused, its route/resource.
  { section: 'Archive', roles: ['admin'], items: [
    // Dashboard shows the same cards + weekly chart.
    { path: '/sales', label: 'Sales Overview', icon: 'sales', roles: ['admin'] },
    // Same query as Supervisors › Attendance (supervisor attendance rows).
    { path: '/outlet-attendance', label: 'Outlet Attendance', icon: 'supervisors', roles: ['admin'] },
    // Same page as Sales › SKU Wise Sales.
    { path: '/sponsor/sales', label: 'Client: Outlet & SKU Wise', icon: 'reports', roles: ['admin'] },
    // Same API + filters as Reports › Brand Wise.
    { path: '/reports/client-brand-wise', label: 'Client: Brand Wise', icon: 'reports', roles: ['admin'] },
    // Read-only subset of Staff › List.
    { path: '/promoter-list', label: 'Promoter List', icon: 'staff', roles: ['admin'] },
  ]},
];
