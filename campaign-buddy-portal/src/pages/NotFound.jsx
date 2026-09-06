import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="empty-state">
      <div className="big">Page not found</div>
      <Link to="/dashboard" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', marginTop: 12 }}>Back to dashboard</Link>
    </div>
  );
}
