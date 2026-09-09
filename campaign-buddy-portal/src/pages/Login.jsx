import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, status, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authed') return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await login(username, password);
    setSubmitting(false);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-badge">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M4 17L9 12L13 16L20 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 8H20V14" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="login-title h-display">Campaign Buddy</div>
        <div className="login-sub">Sign in to the Admin / Supervisor / Sponsor portal.</div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {authError ? <div className="form-error" style={{ marginBottom: 14 }}>{authError}</div> : null}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-credit">Dyro Technologies</div>
      </div>
    </div>
  );
}
