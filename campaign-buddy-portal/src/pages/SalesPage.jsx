import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  activations as activationsApi,
  outlets as outletsApi,
  staff as staffApi,
  salesLookup,
  salesRecords as salesRecordsApi,
  dailyStats as dailyStatsApi,
  attendance as attendanceApi,
} from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return '';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function saleValue(r) {
  const price = r.activationItem?.campaignItem?.item?.unitPrice ?? 0;
  return (r.soldToday || 0) * price;
}

export default function SalesPage() {
  const { currentCampaignId } = useAuth();
  const { push } = useToast();

  const [outlets, setOutlets] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [activationsList, setActivationsList] = useState([]);
  const [form, setForm] = useState({ outletId: '', staffId: '', activationId: '', date: todayISO() });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [recentSales, setRecentSales] = useState(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [today, setToday] = useState({ totalSales: 0, outletCount: 0, footFall: 0, approached: 0 });
  const [week, setWeek] = useState([]);

  useEffect(() => {
    if (!currentCampaignId) return;
    Promise.all([outletsApi.list(), staffApi.search(''), activationsApi.list(currentCampaignId)])
      .then(([o, s, a]) => { setOutlets(o?.data || []); setStaffList(s?.data || []); setActivationsList(a?.data || []); })
      .catch(() => {});
  }, [currentCampaignId]);

  useEffect(() => {
    if (!currentCampaignId) return;
    setRecentLoading(true);
    Promise.all([
      salesRecordsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
      dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
      attendanceApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
    ])
      .then(([salesRes, statsRes, attRes]) => {
        const salesRows = salesRes?.data || [];
        setRecentSales(salesRows);

        const todaySales = salesRows.filter((r) => String(r.date).slice(0, 10) === todayISO());
        const totalSales = todaySales.reduce((s, r) => s + saleValue(r), 0);
        const attRows = attRes?.data || [];
        const outletIds = new Set(
          attRows.filter((a) => String(a.date).slice(0, 10) === todayISO() && a.checkInAt)
            .map((a) => a.activation?.outletId).filter(Boolean)
        );
        const days = statsRes?.data?.byDay || [];
        const todayStat = days.filter((r) => String(r.date).slice(0, 10) === todayISO()).reduce(
          (acc, r) => ({ footFall: acc.footFall + (r.footFall || 0), approached: acc.approached + (r.approached || 0) }),
          { footFall: 0, approached: 0 }
        );
        setToday({ totalSales, outletCount: outletIds.size, ...todayStat });

        const weekMap = {};
        for (let i = 6; i >= 0; i--) weekMap[todayISO(-i)] = 0;
        for (const r of salesRows) {
          const day = String(r.date).slice(0, 10);
          if (weekMap[day] !== undefined) weekMap[day] += saleValue(r);
        }
        setWeek(Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, totalSales]) => ({ date, totalSales })));
      })
      .catch(() => setRecentSales([]))
      .finally(() => setRecentLoading(false));
  }, [currentCampaignId]);

  async function loadSales() {
    setLoading(true); setError(null);
    try {
      const res = await salesLookup.load(currentCampaignId, form);
      setRows((res?.data || []).map((r) => ({ ...r, selected: false })));
    } catch (e) {
      setError(e.message || 'Could not load sales for this selection.');
    } finally {
      setLoading(false);
    }
  }

  function setCell(idx, key, val) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  }

  async function saveCorrections() {
    try {
      await Promise.all((rows || []).filter((r) => r.selected).map((r) =>
        salesRecordsApi.correct(currentCampaignId, r.id, { openingStock: Number(r.openingStock), soldToday: Number(r.soldToday) })
      ));
      push('Sales corrections saved');
      salesRecordsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() })
        .then((res) => setRecentSales(res?.data || []))
        .catch(() => {});
    } catch (e) {
      push(e.message || 'Could not save corrections', 'error');
    }
  }

  const last7Days = useMemo(() => {
    if (!recentSales) return [];
    const map = {};
    for (let i = 6; i >= 0; i--) {
      map[todayISO(-i)] = { date: todayISO(-i), items: [], totalSales: 0, totalUnits: 0 };
    }
    for (const r of recentSales) {
      const day = String(r.date).slice(0, 10);
      if (!map[day]) continue;
      const itemName = r.activationItem?.campaignItem?.item?.name || 'Unknown';
      const outletName = r.activationItem?.activation?.outlet?.name || '—';
      const val = saleValue(r);
      map[day].items.push({ itemName, outletName, soldToday: r.soldToday, openingStock: r.openingStock, unitPrice: r.activationItem?.campaignItem?.item?.unitPrice ?? 0, value: val });
      map[day].totalSales += val;
      map[day].totalUnits += r.soldToday || 0;
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [recentSales]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  return (
    <div>
      <div className="page-head"><div><h1>Sales</h1><p className="page-sub">Update daily sales and review the last 7 days.</p></div></div>

      <div className="stat-grid cols-4">
        <StatCard label="Sales Today" value={`LKR ${today.totalSales.toLocaleString()}`} />
        <StatCard label="Active Outlets Today" value={today.outletCount || '—'} />
        <StatCard label="Foot Fall Today" value={today.footFall || 0} />
        <StatCard label="Customers Approached Today" value={today.approached || 0} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">This Week</div>
        <div className="panel-sub">Last 7 days</div>
        <div className="bars-row">
          {week.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : week.map((w, i) => {
            const maxWeek = Math.max(1, ...week.map((d) => d.totalSales));
            return (
              <div className="bar-col" key={w.date}>
                <div className={`bar ${i === week.length - 1 ? 'today' : ''}`} style={{ height: `${Math.max(6, (w.totalSales / maxWeek) * 130)}px` }} />
                <div className="day">{w.date.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Update Sales</div>
        <div className="panel-sub">Select outlet, promoter, activation and date to correct sales.</div>
        <div className="filter-bar" style={{ marginTop: 12 }}>
          <div className="filter-field"><label>Outlet</label>
            <select value={form.outletId} onChange={(e) => setForm((f) => ({ ...f, outletId: e.target.value }))}>
              <option value="">Select...</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="filter-field"><label>Promoter</label>
            <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}>
              <option value="">Select...</option>{staffList.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.fullName}</option>)}
            </select>
          </div>
          <div className="filter-field"><label>Activation</label>
            <select value={form.activationId} onChange={(e) => setForm((f) => ({ ...f, activationId: e.target.value }))}>
              <option value="">Select...</option>{activationsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="filter-field"><label>Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={loadSales} style={{ alignSelf: 'flex-end' }}>Load sales</button>
        </div>

        {loading ? <Loader /> : error ? <ErrorState message={error} /> : rows ? (
          <div className="table-card" style={{ marginTop: 12 }}>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th></th><th>Product</th><th>Unit Price</th><th>Initial Qty</th><th>Sold Qty</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || i}>
                      <td><input type="checkbox" checked={!!r.selected} onChange={(e) => setCell(i, 'selected', e.target.checked)} /></td>
                      <td className="cell-strong">{r.itemName}</td>
                      <td>LKR {Number(r.unitPrice || 0).toLocaleString()}</td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.openingStock} onChange={(e) => setCell(i, 'openingStock', e.target.value)} /></td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.soldToday} onChange={(e) => setCell(i, 'soldToday', e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span /><button className="btn btn-primary btn-sm" onClick={saveCorrections}>Save corrections</button></div>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-title">Last 7 Days Sales</div>
        <div className="panel-sub">Daily sales summary across all outlets.</div>
        {recentLoading ? <Loader /> : last7Days.length === 0 ? (
          <div className="cell-muted" style={{ marginTop: 12 }}>No sales data for the last 7 days.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {last7Days.map((day) => (
              <div key={day.date} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtDate(day.date)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {day.totalUnits} units &middot; LKR {day.totalSales.toLocaleString()}
                  </div>
                </div>
                {day.items.length === 0 ? (
                  <div className="cell-muted" style={{ fontSize: 12, padding: '4px 0' }}>No sales recorded</div>
                ) : (
                  day.items.map((item, idx) => (
                    <div className="rank-row" key={idx}>
                      <div style={{ flex: 1 }}>
                        <div className="rank-name" style={{ fontSize: 13 }}>{item.itemName}</div>
                        <div className="rank-meta">{item.outletName}</div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.soldToday} / {item.openingStock}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LKR {item.value.toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
