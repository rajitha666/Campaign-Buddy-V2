import { useEffect, useState } from 'react';
import { staff as staffApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

export default function StaffProfiles() {
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    staffApi.search('').then((res) => {
      const opts = res?.data || [];
      setStaffOptions(opts);
      if (opts[0]) setStaffId(opts[0].id);
    }).catch(() => {});
  }, []);

  async function load() {
    if (!staffId) return;
    setLoading(true); setError(null);
    try {
      const res = await staffApi.evaluation(staffId, {});
      setData(res?.data || null);
    } catch (e) {
      setError(e.message || 'Could not load this evaluation.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [staffId]);

  const selected = staffOptions.find((s) => s.id === staffId);

  return (
    <div>
      <div className="page-head"><div><h1>Staff Profiles</h1><p className="page-sub">Per-promoter performance analytics.</p></div></div>
      <div className="filter-bar">
        <div className="filter-field">
          <label>Promoter</label>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.fullName}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : !data ? (
        <ErrorState message="No evaluation data returned for this promoter yet." />
      ) : (
        <div className="dash-grid">
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="avatar-mini" style={{ width: 56, height: 56, fontSize: 19, borderRadius: 16 }}>
                {(selected?.displayName || '?').slice(0, 2).toUpperCase()}
              </div>
              <div><div className="h-display" style={{ fontSize: 17 }}>{selected?.displayName}</div><div className="cell-muted">{selected?.userType}</div></div>
            </div>
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Overall Performance</div><div className="n" style={{ fontSize: 17 }}>{data.overallPerformancePct ?? '—'}%</div></div>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Attendance</div><div className="n" style={{ fontSize: 17 }}>{data.attendancePct ?? '—'}%</div></div>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Total Sales</div><div className="n" style={{ fontSize: 17 }}>LKR {(data.totalSales ?? 0).toLocaleString()}</div></div>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Total Items</div><div className="n" style={{ fontSize: 17 }}>{data.totalItems ?? 0} units</div></div>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Avg Sales / Month</div><div className="n" style={{ fontSize: 17 }}>LKR {(data.avgSalesPerMonth ?? 0).toLocaleString()}</div></div>
              <div className="stat-card" style={{ padding: 13 }}><div className="l">Highest Daily Sales</div><div className="n" style={{ fontSize: 17 }}>LKR {(data.highestDailySales ?? 0).toLocaleString()}</div></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">Brand contribution</div>
            {(data.brandContribution || []).length === 0 ? <div className="cell-muted" style={{ marginTop: 12 }}>No brand breakdown returned.</div> : (
              <div style={{ marginTop: 12 }}>
                {(data.brandContribution || []).map((b, i) => (
                  <div className="rank-row" key={i}>
                    <div className="sw" style={{ width: 9, height: 9, borderRadius: '50%', background: ['#FF7A33', '#2673B0', '#1F9D55'][i % 3], marginRight: 8 }} />
                    {b.brandName}<div className="rank-val">{b.percent}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="hint-note" style={{ marginTop: 12 }}>
        Reads GET /admin/v1/staff/{'{staffId}'}/evaluation (Backend Spec v3 §4.2).
      </div>
    </div>
  );
}
