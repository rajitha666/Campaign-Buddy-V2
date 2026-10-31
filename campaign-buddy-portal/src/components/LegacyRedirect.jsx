import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { redirectFor } from '../config/legacyPaths';

// Wraps a route whose page was retired (or retired for admins only): sends the
// persona to its replacement, otherwise renders the page as before.
export default function LegacyRedirect({ path, children = null }) {
  const { persona } = useAuth();
  const to = redirectFor(path, persona);
  return to ? <Navigate to={to} replace /> : children;
}
