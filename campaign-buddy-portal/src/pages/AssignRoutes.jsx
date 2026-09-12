import { useEffect, useMemo, useState } from 'react';
import { staff as staffApi, outlets as outletsApi, activations as activationsApi, supervisorRoutes as routesApi } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Drawer from '../components/Drawer';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AssignRoutes() {
  const { currentCampaignId } = useAuth();
  const { push } = useToast();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [supervisors, setSupervisors] = useState([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [routes, setRoutes] = useState([]);
  const [outletNames, setOutletNames] = useState({});
  const [campaignOutlets, setCampaignOutlets] = useState([]); // outlets with an Activation on this campaign
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);

  useEffect(() => {
    staffApi.search('', { pageSize: 1000 }).then((res) => {
      const sup = (res?.data || []).filter((s) => s.userType === 'supervisor');
      setSupervisors(sup);
      if (sup[0]) setSupervisorId(sup[0].id);
    }).catch(() => {});
    outletsApi.list({ pageSize: 1000 }).then((res) => {
      setOutletNames(Object.fromEntries((res?.data || []).map((o) => [o.id, o.name])));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentCampaignId) return;
    activationsApi.list(currentCampaignId, { pageSize: 1000 }).then((res) => {
      const ids = Array.from(new Set((res?.data || []).map((a) => a.outletId).filter(Boolean)));
      setCampaignOutlets(ids);
    }).catch(() => {});
  }, [currentCampaignId]);

  const supervisorOptions = useMemo(
    () => supervisors.map((s) => ({ value: s.id, label: s.displayName || s.fullName })),
    [supervisors]
  );
  const outletOptions = useMemo(
    () => campaignOutlets.map((id) => ({ value: id, label: outletNames[id] || id })),
    [campaignOutlets, outletNames]
  );

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leadBlanks = cursor.getDay();

  async function load() {
    if (!supervisorId || !currentCampaignId) return;
    setLoading(true); setError(null);
    try {
      const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString().slice(0, 10);
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).toISOString().slice(0, 10);
      const res = await routesApi.list(currentCampaignId, { supervisorId, dateFrom: from, dateTo: to });
      setRoutes(res?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load routes.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supervisorId, cursor, currentCampaignId]);

  // A v3 SupervisorRoute is { outletIds: string[], dateFrom, dateTo } — a set of
  // outlets over a date range. Expand each into per-day chips for the calendar.
  const routesByDay = useMemo(() => {
    const map = {};
    for (const r of routes) {
      const start = new Date(String(r.dateFrom).slice(0, 10));
      const end = new Date(String(r.dateTo).slice(0, 10));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        for (const outletId of r.outletIds || []) {
          (map[iso] = map[iso] || []).push({ outletId, name: outletNames[outletId] || outletId });
        }
      }
    }
    return map;
  }, [routes, outletNames]);

  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(<div className="cal-cell faded" key={`lead-${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRoutes = routesByDay[iso] || [];
    cells.push(
      <div className="cal-cell" key={iso}>
        <div className="dnum">{d}</div>
        {dayRoutes.map((r, i) => <span className={`cal-chip ${i % 2 ? 'mango' : ''}`} key={i}>{r.name}</span>)}
      </div>
    );
  }

  const fields = [
    { key: 'supervisorStaffId', label: 'Supervisor', type: 'searchable-select', required: true, options: supervisorOptions, placeholder: 'Select supervisor…' },
    { key: 'outletIds', label: 'Outlets', type: 'multi-checkbox', required: true, options: outletOptions, filterPlaceholder: 'Search outlets…' },
    { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
  ];
  const initialValues = editingRoute ? {
    supervisorStaffId: editingRoute.supervisorStaffId,
    outletIds: editingRoute.outletIds || [],
    dateRange: [String(editingRoute.dateFrom).slice(0, 10), String(editingRoute.dateTo).slice(0, 10)],
  } : { supervisorStaffId: supervisorId };

  function openCreate() { setEditingRoute(null); setDrawerOpen(true); }
  function openEdit(route) { setEditingRoute(route); setDrawerOpen(true); }
  function closeDrawer() { setDrawerOpen(false); setEditingRoute(null); }

  async function handleSave(values) {
    const [dateFrom, dateTo] = values.dateRange || [];
    const body = { supervisorStaffId: values.supervisorStaffId, outletIds: values.outletIds || [], dateFrom, dateTo };
    if (editingRoute) await routesApi.update(currentCampaignId, editingRoute.id, body);
    else await routesApi.create(currentCampaignId, body);
    push(editingRoute ? 'Route updated.' : 'Route assigned.');
    load();
  }

  async function handleDelete(route) {
    if (!window.confirm('Delete this route assignment?')) return;
    try {
      await routesApi.remove(currentCampaignId, route.id);
      push('Route deleted.');
      load();
    } catch (e) {
      push(e.message || 'Could not delete route.');
    }
  }

  function supervisorLabel(id) {
    const s = supervisors.find((x) => x.id === id);
    return s ? (s.displayName || s.fullName) : id;
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Assign Routes</h1><p className="page-sub">Plan which outlets a supervisor visits, by date.</p></div>
        <button className="btn btn-primary" onClick={openCreate}>+ Assign Routes</button>
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
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Routes this month</div>
        <table className="data-table">
          <thead><tr><th>Supervisor</th><th>Outlets</th><th>Date range</th><th></th></tr></thead>
          <tbody>
            {routes.length === 0 ? (
              <tr><td colSpan={4} className="cell-muted">No routes assigned for this supervisor this month.</td></tr>
            ) : routes.map((r) => (
              <tr key={r.id}>
                <td className="cell-strong">{supervisorLabel(r.supervisorStaffId)}</td>
                <td>{(r.outletIds || []).length} outlet{(r.outletIds || []).length === 1 ? '' : 's'}</td>
                <td>{String(r.dateFrom).slice(0, 10)} – {String(r.dateTo).slice(0, 10)}</td>
                <td>
                  <span className="icon-btn" onClick={() => openEdit(r)} title="Edit">✎</span>
                  <span className="icon-btn delete" onClick={() => handleDelete(r)} title="Delete">✕</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Drawer
        open={drawerOpen}
        title={editingRoute ? 'Edit route' : 'Assign route'}
        subtitle="Plan a supervisor's outlet visits over a date range."
        fields={fields}
        initialValues={initialValues}
        saveLabel={editingRoute ? 'Save changes' : 'Assign'}
        onClose={closeDrawer}
        onSubmit={handleSave}
      />
    </div>
  );
}
