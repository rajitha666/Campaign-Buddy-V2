// Sidebar structure, grouped by the job being done (#116). `roles` = which
// personas (see AuthContext.roleToPersona) see an item at all. An item with
// `children` is ONE menu row that opens its first child; the children are the
// tabs shown at the top of each of those pages (components/PageTabs.jsx), so the
// menu stays one level deep and no label repeats its parent. Generic list/CRUD
// pages are driven by config/resources.js via ResourcePage; a few screens are
// bespoke (see App.jsx routes).
export const NAV = [
  { section: null, items: [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'supervisor', 'sponsor'] },
  ]},
  { section: 'Today', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { path: '/tracking/live', label: 'Live Locations', icon: 'tracking', roles: ['admin', 'supervisor', 'sponsor'] },
    { label: 'Attendance', icon: 'staff', roles: ['admin'], children: [
      { path: '/staff/attendance', label: 'Check-ins' },
      { path: '/staff/absence', label: 'Absence' },
      { path: '/reports/monthly-attendance', label: 'Monthly' },
    ]},
    { path: '/my-outlet-attendance', label: 'Outlet Attendance', icon: 'supervisors', roles: ['supervisor'] },
    // Client role (doc G) — read-only visibility into both attendance logs
    // for their own campaign, same generic outlet-scoping as everyone else.
    { path: '/staff/attendance', label: 'Attendance', icon: 'staff', roles: ['sponsor'] },
    { path: '/supervisor-attendance', label: 'Supervisor Attendance', icon: 'supervisors', roles: ['sponsor'] },
    { path: '/sales/status', label: 'Sales Update Status', icon: 'sales', roles: ['admin'] },
  ]},
  { section: 'Campaigns', roles: ['admin', 'supervisor'], items: [
    { label: 'Campaigns', icon: 'campaigns', roles: ['admin'], children: [
      { path: '/campaigns', label: 'All campaigns' },
      { path: '/activations', label: 'Activations' },
    ]},
    { path: '/my-campaigns', label: 'My Campaigns', icon: 'campaigns', roles: ['supervisor'] },
    { label: 'Products', icon: 'items', roles: ['admin'], children: [
      { path: '/items', label: 'All products' },
      { path: '/brands', label: 'Brands' },
      { path: '/reorder', label: 'Reorder' },
    ]},
    { path: '/sales/update', label: 'Update Sales', icon: 'updatesales', roles: ['admin'] },
    { path: '/sales/custom-fields', label: 'Custom Sales Fields', icon: 'sales', roles: ['admin'] },
  ]},
  { section: 'Setup', roles: ['admin'], items: [
    { path: '/clients', label: 'Clients', icon: 'clients', roles: ['admin'] },
    { label: 'Outlets', icon: 'outlets', roles: ['admin'], children: [
      { path: '/outlets', label: 'All outlets' },
      { path: '/distributors', label: 'Distributor Points' },
      { path: '/cities', label: 'Cities' },
    ]},
  ]},
  { section: 'People', roles: ['admin', 'supervisor'], items: [
    { label: 'Staff', icon: 'staff', roles: ['admin'], children: [
      { path: '/staff', label: 'All staff' },
      { path: '/staff/profiles', label: 'Profiles' },
    ]},
    { path: '/leave-requests', label: 'Leave Requests', icon: 'staff', roles: ['admin'] },
    { label: 'Supervisors', icon: 'supervisors', roles: ['admin'], children: [
      { path: '/supervisor-tasks', label: 'Tasks' },
      { path: '/supervisor-task-results', label: 'Task Results' },
      { path: '/supervisor-attendance', label: 'Attendance' },
      { path: '/assign-routes', label: 'Assign Routes' },
    ]},
    { path: '/my-leave-requests', label: 'Leave Requests', icon: 'staff', roles: ['supervisor'] },
    // Outlet checklist results (photos + 1–5 scores) — read-only, outlet-scoped by grant.
    { path: '/supervisor-task-results', label: 'Task Results', icon: 'supervisors', roles: ['supervisor'] },
  ]},
  { section: 'Reports', roles: ['admin', 'supervisor', 'sponsor'], items: [
    { label: 'Sales Reports', icon: 'sales', roles: ['admin'], children: [
      { path: '/sales/sku-wise', label: 'SKU Wise' },
      { path: '/sales/outlet-wise', label: 'Outlet Wise' },
      // Stock each promoter started the day with (#91).
      { path: '/sales/starting-stock', label: 'Starting Stock' },
    ]},
    { label: 'Overall Reports', icon: 'reports', roles: ['admin'], children: [
      { path: '/reports/sku-wise', label: 'Overall SKU Wise' },
      { path: '/reports/brand-wise', label: 'Brand Wise' },
    ]},
    { label: 'Tracking History', icon: 'tracking', roles: ['admin'], children: [
      { path: '/tracking/promoter', label: 'Promoter' },
      { path: '/tracking/supervisor', label: 'Supervisor' },
    ]},
    { label: 'Client Reports', icon: 'reports', roles: ['sponsor'], children: [
      { path: '/sponsor/sales', label: 'Overall Outlet and SKU Wise' },
      { path: '/reports/client-brand-wise', label: 'Brand Wise' },
    ]},
    { path: '/sales/sku-wise', label: 'SKU Wise Sales', icon: 'sales', roles: ['supervisor'] },
    { path: '/reports/sku-wise', label: 'Overall Reports', icon: 'reports', roles: ['supervisor'] },
    { path: '/sales/starting-stock', label: 'Starting Stock', icon: 'sales', roles: ['supervisor', 'sponsor'] },
    { path: '/tracking/promoter', label: 'Promoter Tracking', icon: 'tracking', roles: ['supervisor', 'sponsor'] },
    { path: '/tracking/supervisor', label: 'Supervisor Tracking', icon: 'tracking', roles: ['sponsor'] },
  ]},
  { section: 'Admin', roles: ['admin'], items: [
    { path: '/recently-deleted', label: 'Recently deleted', icon: 'reports', roles: ['admin'] },
    { label: 'Access', icon: 'users', roles: ['admin'], children: [
      { path: '/users', label: 'Users' },
      { path: '/roles', label: 'Roles' },
    ]},
    { path: '/license', label: 'License Usage', icon: 'reports', roles: ['admin'] },
    { path: '/issues', label: 'Issue Reports', icon: 'reports', roles: ['admin'] },
    { path: '/system-status', label: 'System Status', icon: 'reports', roles: ['admin'] },
  ]},
];
