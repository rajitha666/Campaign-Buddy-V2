import { useCallback, useEffect, useState } from 'react';
import { deleted as deletedApi } from '../lib/endpoints';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

// #113 — what was removed, by whom and when, with a Restore button. Soft-deleted rows are
// kept (nothing is purged), so Restore works long after the Undo toast is gone.

export const ENTITY_LABELS = {
  client: 'Client', brand: 'Brand', item: 'Product', city: 'City', outlet: 'Outlet',
  distributor_point: 'Distributor point', staff: 'Staff', campaign: 'Campaign',
  campaign_item: 'Campaign product', activation: 'Activation', activation_item: 'Activation product',
  supervisor_route: 'Route assignment', supervisor_task: 'Supervisor task', sales_field: 'Custom sales field',
  sales_record: 'Sales record',
};
const GLOBAL_TYPES = ['client', 'brand', 'item', 'city', 'outlet', 'distributor_point', 'staff', 'campaign'];
const CAMPAIGN_TYPES = ['campaign_item', 'activation', 'activation_item', 'supervisor_route', 'supervisor_task', 'sales_field', 'sales_record'];
const PAGE_SIZE = 25;

export function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RecentlyDeleted() {
  const { currentCampaignId, currentCampaign } = useAuth();
  const { push } = useToast();
  const [scope, setScope] = useState('global'); // 'global' | 'campaign'
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const types = scope === 'global' ? GLOBAL_TYPES : CAMPAIGN_TYPES;

  const load = useCallback(async () => {
    if (scope === 'campaign' && !currentCampaignId) { setRows([]); setTotal(0); setLoading(false); return; }
    setError('');
    try {
      const res = await (scope === 'global'
        ? deletedApi.list({ entity: entity || undefined, q: q || undefined, page, pageSize: PAGE_SIZE })
        : deletedApi.listForCampaign(currentCampaignId, { entity: entity || undefined, q: q || undefined, page, pageSize: PAGE_SIZE }));
      setRows(res.data || []);
      setTotal(res.meta?.total ?? (res.data || []).length);
    } catch (e) {
      setError(e.message || 'Could not load deleted records');
    } finally {
      setLoading(false);
    }
  }, [scope, entity, q, page, currentCampaignId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [scope, entity, q, currentCampaignId]);
  useEffect(() => { setEntity(''); }, [scope]);

  async function restore(row) {
    setBusyId(row.id);
    try {
      await api.post(row.restore.path);
      push(`Restored "${row.label}"`);
    } catch (e) {
      // 409 PARENT_DELETED / CODE_IN_USE etc. carry a readable server message
      push(e.status === 404 ? `"${row.label}" was already restored or no longer exists.` : `Couldn't restore "${row.label}". ${e.message || ''}`.trim(), 'error');
    } finally {
      setBusyId('');
      load();
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Recently deleted</h1>
          <p className="page-sub">Removed records are kept, so you can bring them back here at any time. Sales, attendance and tracking history is never permanently deleted.</p>
        </div>
      </div>

      <div className="chip-row" role="tablist" aria-label="Where to look" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={scope === 'global'} className={`chip-opt${scope === 'global' ? ' selected' : ''}`} onClick={() => setScope('global')}>
          Clients, products, outlets, staff &amp; campaigns
        </button>
        <button type="button" role="tab" aria-selected={scope === 'campaign'} className={`chip-opt${scope === 'campaign' ? ' selected' : ''}`} onClick={() => setScope('campaign')}>
          Inside {currentCampaign?.name ? `“${currentCampaign.name}”` : 'the selected campaign'}
        </button>
      </div>

      {scope === 'campaign' && !currentCampaignId ? (
        <ErrorState message="Select a campaign from the top bar first." />
      ) : (
        <div className="table-card">
          <div className="table-toolbar">
            <label className="entries-select">
              Type
              <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filter by type">
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}
              </select>
            </label>
            <div className="search-box">
              <input type="search" placeholder="Search deleted records…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search deleted records" />
            </div>
          </div>
          {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Type</th><th>Deleted by</th><th>When</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="cell-muted">Nothing deleted recently.</td></tr>
                  ) : rows.map((r) => (
                    <tr key={`${r.entity}:${r.id}`}>
                      <td className="cell-strong">{r.label}{r.context ? <div className="rank-meta">{r.context}</div> : null}</td>
                      <td>{ENTITY_LABELS[r.entity] || r.entity}</td>
                      <td>{r.deletedBy?.displayName || '—'}</td>
                      <td>{formatWhen(r.deletedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                          {!r.canRestore ? (
                            <span className="rank-meta" role="note">Restore the {r.blockedBy?.parent || 'parent'} first</span>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!r.canRestore || busyId === r.id}
                            onClick={() => restore(r)}
                            aria-label={`Restore ${r.label}`}
                          >
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-footer">
            <span>{total} deleted record{total === 1 ? '' : 's'}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="active" aria-current="page">{page} / {pages}</button>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
