import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaigns as campaignsApi } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import SearchableSelect from '../components/SearchableSelect';

const emptyNewAdmin = { username: '', password: '', displayName: '', email: '' };

// Lets a Super Admin OR any existing Campaign Admin of this campaign link
// another Campaign Admin account to it — either picking an existing "usr"
// account or creating a brand-new one inline. Linking never removes another
// admin; a campaign can have any number of admins (backend: one
// CampaignAccessGrant row per user+campaign).
export default function CampaignAdmins() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { push } = useToast();

  const [grants, setGrants] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [pickUserId, setPickUserId] = useState('');
  const [linking, setLinking] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState(emptyNewAdmin);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [grantsRes, candidatesRes] = await Promise.all([
        campaignsApi.admins(campaignId),
        campaignsApi.adminCandidates(campaignId, ''),
      ]);
      setGrants((grantsRes?.data || []).filter((g) => g.user?.roleId === 'usr'));
      setCandidates(candidatesRes?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load campaign admins.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const linkedUserIds = new Set(grants.map((g) => g.userId));
  const availableOptions = candidates
    .filter((u) => !linkedUserIds.has(u.id))
    .map((u) => ({ value: u.id, label: u.email ? `${u.displayName} (${u.username}) — ${u.email}` : `${u.displayName} (${u.username})` }));

  async function linkExisting() {
    if (!pickUserId) return;
    setLinking(true);
    try {
      await campaignsApi.addAdmin(campaignId, { userId: pickUserId });
      push('Admin linked to campaign');
      setPickUserId('');
      load();
    } catch (e) { push(e.message || 'Could not link admin', 'error'); }
    finally { setLinking(false); }
  }

  async function createAndLink() {
    if (!newAdmin.username || !newAdmin.password || !newAdmin.displayName) {
      push('Username, password and display name are required', 'error');
      return;
    }
    setCreating(true);
    try {
      await campaignsApi.addAdmin(campaignId, { newUser: newAdmin });
      push('New admin account created and linked');
      setNewAdmin(emptyNewAdmin);
      setShowNewForm(false);
      load();
    } catch (e) { push(e.message || 'Could not create admin account', 'error'); }
    finally { setCreating(false); }
  }

  async function unlink(userId) {
    if (!window.confirm('Remove this admin from the campaign? Their account is not deleted.')) return;
    try {
      await campaignsApi.removeAdmin(campaignId, userId);
      push('Admin removed from campaign');
      load();
    } catch (e) { push(e.message || 'Could not remove admin', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaign Admins</h1>
          <p className="page-sub">Campaign Admin accounts linked to this campaign — a campaign can have any number of admins.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/campaigns')}>← Back to Campaigns</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          {isAdmin ? (
            <div className="table-card" style={{ marginBottom: 16, padding: 16 }}>
              <div className="filter-bar">
                <div className="filter-field" style={{ minWidth: 320 }}>
                  <label>Link an existing admin account</label>
                  <SearchableSelect
                    options={availableOptions}
                    value={pickUserId}
                    onChange={setPickUserId}
                    placeholder="Search by name, username or email…"
                  />
                </div>
                <button className="btn btn-primary btn-sm" onClick={linkExisting} disabled={!pickUserId || linking}>
                  {linking ? 'Linking…' : 'Link Admin'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm((v) => !v)}>
                  {showNewForm ? 'Cancel new account' : '+ New Admin Account'}
                </button>
              </div>
              {showNewForm ? (
                <div className="form-two" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div className="form-row">
                    <label>Mobile App Username <span className="req">*</span></label>
                    <input type="text" placeholder="lowercase, no spaces" value={newAdmin.username}
                      onChange={(e) => setNewAdmin((v) => ({ ...v, username: e.target.value }))} />
                  </div>
                  <div className="form-row">
                    <label>Password <span className="req">*</span></label>
                    <input type="password" value={newAdmin.password}
                      onChange={(e) => setNewAdmin((v) => ({ ...v, password: e.target.value }))} />
                  </div>
                  <div className="form-row">
                    <label>Display Name <span className="req">*</span></label>
                    <input type="text" value={newAdmin.displayName}
                      onChange={(e) => setNewAdmin((v) => ({ ...v, displayName: e.target.value }))} />
                  </div>
                  <div className="form-row">
                    <label>Email</label>
                    <input type="email" value={newAdmin.email}
                      onChange={(e) => setNewAdmin((v) => ({ ...v, email: e.target.value }))} />
                  </div>
                  <div>
                    <button className="btn btn-primary btn-sm" onClick={createAndLink} disabled={creating}>
                      {creating ? 'Creating…' : 'Create & Link'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="table-card">
            {grants.length === 0 ? (
              <div className="empty-state"><div className="big">No admins linked yet</div>Link an existing account or create a new one above.</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Username</th><th>Email</th>{isAdmin ? <th>Action</th> : null}</tr></thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={g.id}>
                        <td className="cell-strong">{g.user?.displayName || g.userId}</td>
                        <td>{g.user?.username || '—'}</td>
                        <td className="cell-muted">{g.user?.email || '—'}</td>
                        {isAdmin ? <td><div className="icon-btn delete" onClick={() => unlink(g.userId)}>✕</div></td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
