import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Login from './pages/Login';
import DashboardRouter from './pages/DashboardRouter';
import ResourcePage from './pages/ResourcePage';
import CampaignItems from './pages/CampaignItems';
import ActivationItems from './pages/ActivationItems';
import ActivationTargets from './pages/ActivationTargets';
import StaffProfiles from './pages/StaffProfiles';
import UpdateSales from './pages/UpdateSales';
import SalesPage from './pages/SalesPage';
import CustomSalesFields from './pages/CustomSalesFields';
import LicenseUsage from './pages/LicenseUsage';
import AssignRoutes from './pages/AssignRoutes';
import MonthlyAttendance from './pages/MonthlyAttendance';
import LiveMap from './pages/LiveMap';
import NotFound from './pages/NotFound';

const R = (key) => () => <ResourcePage resourceKey={key} />;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardRouter />} />

              <Route path="/clients" element={R('clients')()} />
              <Route path="/items" element={R('items')()} />
              <Route path="/brands" element={R('brands')()} />
              <Route path="/reorder" element={R('reorder')()} />

              <Route path="/campaigns" element={R('campaigns')()} />
              <Route path="/campaigns/:campaignId/items" element={<CampaignItems />} />
              <Route path="/activations" element={R('activations')()} />
              <Route path="/my-campaigns" element={R('activationListClient')()} />
              <Route path="/activations/client" element={R('activationListClient')()} />
              <Route path="/campaigns/:campaignId/activations/:activationId/targets" element={<ActivationTargets />} />
              <Route path="/campaigns/:campaignId/activations/:activationId/items" element={<ActivationItems />} />

              <Route path="/outlets" element={R('outlets')()} />
              <Route path="/distributors" element={R('distributors')()} />
              <Route path="/cities" element={R('cities')()} />

              <Route path="/staff" element={R('staff')()} />
              <Route path="/staff/attendance" element={R('staffAttendance')()} />
              <Route path="/staff/absence" element={R('staffAbsence')()} />
              <Route path="/leave-requests" element={R('leaveRequests')()} />
              <Route path="/my-leave-requests" element={R('leaveRequests')()} />
              <Route path="/staff/profiles" element={<StaffProfiles />} />
              <Route path="/promoter-list" element={R('promoterListReadOnly')()} />

              <Route path="/supervisor-tasks" element={R('supervisorTasks')()} />
              <Route path="/outlet-attendance" element={R('outletAttendance')()} />
              <Route path="/my-outlet-attendance" element={R('outletAttendance')()} />
              <Route path="/supervisor-attendance" element={R('supervisorAttendance')()} />
              <Route path="/assign-routes" element={<AssignRoutes />} />

              <Route path="/sales" element={<SalesPage />} />
              <Route path="/sales/sku-wise" element={R('skuSales')()} />
              <Route path="/sponsor/sales" element={R('skuSales')()} />
              <Route path="/sales/status" element={R('salesStatus')()} />
              <Route path="/sales/outlet-wise" element={R('outletWise')()} />
              <Route path="/sales/update" element={<UpdateSales />} />
              <Route path="/sales/custom-fields" element={<CustomSalesFields />} />

              <Route path="/tracking/promoter" element={R('promoterTracking')()} />
              <Route path="/tracking/supervisor" element={R('supervisorTracking')()} />
              <Route path="/tracking/live" element={<LiveMap />} />

              <Route path="/reports/sku-wise" element={R('reportSkuWise')()} />
              <Route path="/reports/brand-wise" element={R('reportBrandWise')()} />
              <Route path="/reports/monthly-attendance" element={<MonthlyAttendance />} />
              <Route path="/reports/client-sku-wise" element={R('clientReports')()} />
              <Route path="/reports/client-brand-wise" element={R('brandWiseClient')()} />

              <Route path="/users" element={R('users')()} />
              <Route path="/roles" element={R('roles')()} />
              <Route path="/license" element={<LicenseUsage />} />

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
