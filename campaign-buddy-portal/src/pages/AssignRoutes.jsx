import { useEffect, useMemo, useState } from 'react';
import { staff as staffApi, outlets as outletsApi, assumed } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AssignRoutes() {
  const { push } = useToast();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [supervisors, setSupervisors] = useState([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    staffApi.search('').then((res) => {
      const sup = (res?.data || []).filter((s) => s.userType === 'supervisor');
      setSupervisors(sup);
      if (sup[0]) setSupervisorId(sup[0].id);
    }).catch(() => {});
  }, []);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leadBlanks = cursor.getDay();

  async function load() {
    if (!supervisorId) return;
    setLoading(true); setError(null);
    try {
      const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString().slice(0, 10);
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).toISOString().slice(0, 10);
      const res = await assumed.assignedRoutes.list({ supervisorId, dateFrom: from, dateTo: to });
      setRoutes(res?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load routes.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supervisorId, cursor]);

  const routesByDay = useMemo(() => {
    const map = {};
    routes.forEach((r) => { (map[r.date] = map[r.date] || []).push(r); });
    return map;
  }, [routes]);

  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(<div className="cal-cell faded" key={`lead-${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRoutes = routesByDay[iso] || [];
    cells.push(
      <div className="cal-cell" key={iso}>
        <div className="dnum">{d}</div>
        {dayRoutes.map((r, i) => <span className={`cal-chip ${i % 2 ? 'mango' : ''}`} key={i}>{r.outletName || r.outletId}</span>)}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Assign Routes</h1><p className="page-sub">Plan which outlets a supervisor visits, by date.</p></div>
        <button className="btn btn-primary" onClick={() => setAssignOpen(true)}>+ Assign Routes</button>
      </div>
      <div className="filter-bar">
        <div className="filter-field"><label>Supervisor</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            {supervisors.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.fullName}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>Load</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="panel">
          <div className="cal-head">
            <div className="panel-title">{monthLabel}</div>
            <div className="cal-nav">
              <span className="icon-btn" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>‹</span>
              <span className="icon-btn" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>›</span>
            </div>
          </div>
          <div className="cal-grid">
            {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
            {cells}
          </div>
        </div>
      )}
      <div className="hint-note" style={{ marginTop: 12 }}>
        Uses GET/POST /supervisor-routes — an assumed endpoint (not yet in the Unified Backend Spec).
      </div>
    </div>
  );

  function setAssignOpen() { push('Route assignment form is next on the build list — wire to POST /supervisor-routes.'); }
}
