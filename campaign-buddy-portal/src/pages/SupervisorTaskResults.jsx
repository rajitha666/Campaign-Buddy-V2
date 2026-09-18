import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supervisorTaskResults as api } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import { exportFilename } from '../lib/exportFilename';
import { applyDesignationLabel } from '../lib/designationLabel';
import { resultText, scoreLabel, resultsCsv, toCsv } from '../lib/supervisorResults';

const PAGE_SIZE = 25;
const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => isoDay(new Date(Date.now() - n * 86400000));
const fmtTime = (iso) => new Date(iso).toLocaleString();

// Supervisors' outlet-checklist submissions: score summary, visits whose
// checklist isn't finished, and the answer log with photo thumbnails. Read-only,
// so the same page serves admins, portal supervisors and clients (each already
// outlet-scoped by their campaign grant on the server).
export default function SupervisorTaskResults() {
  const { currentCampaignId, designationLabel } = useAuth();
  const promoter = applyDesignationLabel('Promoter', designationLabel);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null); // { photo, row }

  async function load(nextPage = page) {
    if (!currentCampaignId) return;
    setLoading(true); setError(null);
    try {
      const range = { dateFrom: from, dateTo: to };
      const [s, list] = await Promise.all([
        api.summary(currentCampaignId, range),
        api.list(currentCampaignId, { ...range, page: nextPage, pageSize: PAGE_SIZE }),
      ]);
      setSummary(s?.data || null);
      setRows(list?.data || []);
      setTotal(list?.meta?.total ?? (list?.data || []).length);
      setPage(nextPage);
    } catch (e) {
      setError(e.message || 'Could not load task results.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, [currentCampaignId]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.outletName, r.promoterName, r.supervisorName, r.category, r.task, resultText(r)]
      .some((v) => (v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  async function exportCsv() {
    // Export the whole range, not just the page on screen.
    const all = [];
    for (let p = 1; p <= 100; p++) {
      const res = await api.list(currentCampaignId, { dateFrom: from, dateTo: to, page: p, pageSize: 200 });
      all.push(...(res?.data || []));
      if (all.length >= (res?.meta?.total ?? 0) || !(res?.data || []).length) break;
    }
    const blob = new Blob([toCsv(resultsCsv(all, window.location.origin))], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename('Supervisor Task Results', 'csv');
    a.click();
  }

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Supervisor Task Results</h1>
          <p className="page-sub">What supervisors scored, wrote and photographed at each outlet visit.</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="filter-field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={() => load(1)}>Load</button>
        <button className="btn-excel" style={{ marginLeft: 'auto' }} onClick={exportCsv}>⬇ Excel</button>
      </div>

      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={() => load(1)} /> : !summary ? null : (
        <>
          <div className="stat-grid">
            <StatCard label="Average score" value={scoreLabel(summary.overall.average)} />
            <StatCard label="Ratings given" value={summary.overall.ratings} />
            <StatCard label="Checklists complete" value={summary.visits.complete} />
            <StatCard label="Checklists incomplete" value={summary.visits.incomplete} />
          </div>

          {summary.incompleteVisits.length > 0 ? (
            <div className="table-card" style={{ marginBottom: 16 }}>
              <div style={{ padding: '14px 16px 4px', fontWeight: 700 }}>Incomplete checklists <Badge type="alert">{summary.incompleteVisits.length}</Badge></div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Outlet</th><th>{promoter}</th><th>Supervisor</th><th>Answered</th></tr></thead>
                  <tbody>
                    {summary.incompleteVisits.map((v, i) => (
                      <tr key={i}>
                        <td>{String(v.date).slice(0, 10)}</td><td className="cell-strong">{v.outletName}</td>
                        <td>{v.promoterName}</td><td>{v.supervisorName}</td>
                        <td><Badge type="pending">{v.answered} of {v.total}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
            <ScoreTable title={`Score by ${promoter.toLowerCase()}`} rows={summary.byPromoter} nameKey="name" />
            <ScoreTable title="Score by outlet" rows={summary.byOutlet} nameKey="outletName" />
            <ScoreTable title="Score by category" rows={summary.byCategory} nameKey="category" />
          </div>

          <div className="table-card">
            <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>Answers <span className="hint-note" style={{ marginLeft: 6 }}>{total} in range</span></div>
              <input type="search" placeholder="Search this page…" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ border: '1.5px solid var(--line)', borderRadius: 9, padding: '7px 10px', fontSize: 12.5 }} />
            </div>
            {shown.length === 0 ? <EmptyState title="No answers in this range" /> : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Outlet</th><th>{promoter}</th><th>Supervisor</th><th>Category</th><th>Task</th><th>Result</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td>{String(r.date).slice(0, 10)}</td><td className="cell-strong">{r.outletName}</td>
                        <td>{r.promoterName ?? <span title="Outlet-level task, shared by every promoter at the outlet">—</span>}</td>
                        <td>{r.supervisorName}</td><td>{r.category}</td><td>{r.task}</td>
                        <td>
                          {r.taskType === 'photo' && r.photos.length ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {r.photos.map((p) => (
                                <img key={p.url} src={p.url} alt="Outlet setup" title={`Uploaded ${fmtTime(p.uploadedAt)}`}
                                  onClick={() => setViewing({ photo: p, row: r })}
                                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--line)' }} />
                              ))}
                            </div>
                          ) : resultText(r)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <span className="hint-note">Page {page} of {pages}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
                <button className="btn btn-sm" disabled={page >= pages} onClick={() => load(page + 1)}>Next</button>
              </span>
            </div>
          </div>
        </>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} width={760}
        title={viewing?.row.task || 'Photo'}
        subtitle={viewing ? `${viewing.row.outletName} · ${viewing.row.supervisorName} · uploaded ${fmtTime(viewing.photo.uploadedAt)}` : ''}>
        {viewing ? <img src={viewing.photo.url} alt="Outlet setup" style={{ width: '100%', borderRadius: 10 }} /> : null}
      </Modal>
    </div>
  );
}

function ScoreTable({ title, rows, nameKey }) {
  return (
    <div className="table-card">
      <div style={{ padding: '14px 16px 4px', fontWeight: 700 }}>{title}</div>
      {rows.length === 0 ? <div className="hint-note" style={{ padding: '4px 16px 14px' }}>No ratings yet.</div> : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Average</th><th>Ratings</th></tr></thead>
          <tbody>
            {[...rows].sort((a, b) => b.average - a.average).map((r) => (
              <tr key={r[nameKey]}><td className="cell-strong">{r[nameKey]}</td><td>{scoreLabel(r.average)}</td><td>{r.ratings}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
