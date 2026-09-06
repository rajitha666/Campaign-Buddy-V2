import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

export default function ProtectedRoute({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loader label="Checking your session…" />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return children;
}
