import { useCallback, useEffect, useRef, useState } from 'react';
import { deleted as deletedApi } from '../lib/endpoints';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';

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
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState(''); // debounced copy of qInput
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); // first load
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const headingRef = useRef(null);
  const reqRef = useRef(0); // ignore a slow response that arrives after a newer one

  const types = scope === 'global' ? GLOBAL_TYPES : CAMPAIGN_TYPES;
  const filtered = Boolean(entity || q);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    if (scope === 'campaign' && !currentCampaignId) { setRows([]); setTotal(0); setLoading(false); return; }
    const req = ++reqRef.current;
    setRefreshing(true);
    setError('');
    try {
      const params = { entity: entity || undefined, q: q || undefined, page, pageSize: PAGE_SIZE };
      const res = await (scope === 'global' ? deletedApi.list(params) : deletedApi.listForCampaign(currentCampaignId, params));
      if (req !== reqRef.current) return;
      setRows(res.data || []);
      setTotal(res.meta?.total ?? (res.data || []).length);
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(e.message || 'Could not load deleted records');
    } finally {
      if (req === reqRef.current) { setLoading(false); setRefreshing(false); }
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
      // the row is about to disappear; keep keyboard focus on the page, not <body>
      headingRef.current?.focus();
    } catch (e) {
      // 409 PARENT_DELETED / CODE_IN_USE etc. carry a readable server message
      push(e.status === 404 ? `"${row.label}" was already restored or no longer exists.` : `Couldn't restore "${row.label}". ${e.message || ''}`.trim(), 'error');
    } finally {
      setBusyId('');
      load();
    }
  }

  function restoreControl(r) {
    const noteId = `blocked-${r.entity}-${r.id}`;
    return (
      <div className="row-actions" style={{ alignItems: 'center', gap: 10 }}>
        {!r.canRestore ? (
          <span className="cell-muted" id={noteId} style={{ fontSize: 13 }}>
            Restore the {r.blockedBy?.parent || 'parent record'} first
          </span>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!r.canRestore || busyId === r.id}
          aria-describedby={!r.canRestore ? noteId : undefined}
          onClick={() => restore(r)}
          aria-label={`Restore ${r.label}`}
        >
          {busyId === r.id ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const who = (r) => r.deletedBy?.displayName || 'Unknown';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>Recently deleted</h1>
          <p className="page-sub">Deleted records are kept, so you can restore them here at any time.</p>
        </div>
      </div>

      <div className="chip-row" role="group" aria-label="Where to look" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={scope === 'global'} className={`chip-opt${scope === 'global' ? ' selected' : ''}`} onClick={() => setScope('global')}>
          Clients, products, outlets, staff &amp; campaigns
        </button>
        <button type="button" aria-pressed={scope === 'campaign'} className={`chip-opt${scope === 'campaign' ? ' selected' : ''}`} onClick={() => setScope('campaign')}>
          Inside {currentCampaign?.name ? `“${currentCampaign.name}”` : 'a campaign'}
        </button>
      </div>

      {scope === 'campaign' && !currentCampaignId ? (
        <EmptyState title="Pick a campaign first" hint={<p>Choose a campaign from the top bar to see what was removed inside it.</p>} />
      ) : (
        <div className="table-card" aria-busy={refreshing}>
          <div className="table-toolbar">
            <label className="entries-select">
              Type
              <select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t]}</option>)}
              </select>
            </label>
            <div className="search-box">
              <input type="search" placeholder="Search deleted records…" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Search deleted records" />
            </div>
          </div>

          {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
            <EmptyState
              title={filtered ? 'No matches' : 'Nothing to restore'}
              hint={<p>{filtered ? 'Clear the search or the type filter to see everything.' : 'Records you delete will show up here.'}</p>}
            />
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Deleted by</th><th>When</th><th></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.entity}:${r.id}`}>
                        <td className="cell-strong">{r.label}{r.context ? <div className="rank-meta">{r.context}</div> : null}</td>
                        <td>{ENTITY_LABELS[r.entity] || r.entity}</td>
                        <td>{who(r)}</td>
                        <td>{formatWhen(r.deletedAt)}</td>
                        <td>{restoreControl(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Phone-width fallback, same pattern as DataTable (CSS toggles which one shows). */}
              <div className="table-cards">
                {rows.map((r) => (
                  <div className="data-card" key={`${r.entity}:${r.id}`}>
                    <div className="data-card-field"><span className="data-card-label">Name</span><span className="data-card-value"><strong>{r.label}</strong>{r.context ? <div className="rank-meta">{r.context}</div> : null}</span></div>
                    <div className="data-card-field"><span className="data-card-label">Type</span><span className="data-card-value">{ENTITY_LABELS[r.entity] || r.entity}</span></div>
                    <div className="data-card-field"><span className="data-card-label">Deleted by</span><span className="data-card-value">{who(r)}</span></div>
                    <div className="data-card-field"><span className="data-card-label">When</span><span className="data-card-value">{formatWhen(r.deletedAt)}</span></div>
                    <div className="data-card-actions">{restoreControl(r)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="table-footer">
            <span>{total} deleted record{total === 1 ? '' : 's'}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ padding: '6px 4px' }}>Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
