import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { reports as reportsApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

export default function MonthlyAttendance() {
  const { currentCampaignId } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    if (!currentCampaignId) return;
    setLoading(true); setError(null);
    try {
      const res = await reportsApi.attendanceMonthly(currentCampaignId, month);
      setRows(res?.data?.rows || res?.data || []);
      setDays(res?.data?.days || Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() }, (_, i) => i + 1));
    } catch (e) {
      setError(e.message || 'Could not load monthly attendance.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentCampaignId, month]);

  function exportCsv() {
    const header = ['Promoter', 'Outlet', ...days].join(',');
    const lines = rows.map((r) => [r.staffName, r.outletName, ...days.map((d) => r.days?.[d] ?? '')].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `attendance-${month}.csv`; a.click();
  }

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  return (
    <div>
      <div className="page-head"><div><h1>Monthly Attendance</h1><p className="page-sub">One column per day of the month.</p></div></div>
      <div className="filter-bar">
        <div className="filter-field"><label>Month</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
        <button className="btn-excel" style={{ marginLeft: 'auto' }} onClick={exportCsv}>⬇ Excel</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Promoter</th><th>Outlet</th>{days.map((d) => <th key={d} style={{ textAlign: 'center', padding: '11px 8px' }}>{d}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="cell-strong">{r.staffName}</td><td>{r.outletName}</td>
                    {days.map((d) => {
                      const v = r.days?.[d] ?? '·';
                      const color = v === '✓' ? 'var(--success)' : v === 'A' ? 'var(--alert)' : 'var(--text-muted)';
                      return <td key={d} style={{ textAlign: 'center', padding: '11px 8px', color, fontWeight: 700 }}>{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="hint-note" style={{ marginTop: 10 }}>✓ present · A absent · — on leave · · not yet started</div>
    </div>
  );
}
