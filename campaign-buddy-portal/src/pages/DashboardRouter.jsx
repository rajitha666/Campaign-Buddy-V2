import { useAuth } from '../context/AuthContext';
import Dashboard from './Dashboard';
import SponsorDashboard from './SponsorDashboard';

export default function DashboardRouter() {
  const { persona } = useAuth();
  return persona === 'sponsor' ? <SponsorDashboard /> : <Dashboard />;
}
