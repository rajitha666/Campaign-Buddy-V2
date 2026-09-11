import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  activations as activationsApi,
  outlets as outletsApi,
  staff as staffApi,
  salesRecords as salesRecordsApi,
  dailyStats as dailyStatsApi,
  attendance as attendanceApi,
  salesFields as salesFieldsApi,
} from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import SalesCorrectionGrid from '../components/SalesCorrectionGrid';

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

  const [recentSales, setRecentSales] = useState(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [today, setToday] = useState({ totalSales: 0, outletCount: 0, footFall: 0, approached: 0 });
  const [week, setWeek] = useState([]);
  const [dayFieldValues, setDayFieldValues] = useState([]);

  useEffect(() => {
    if (!currentCampaignId) return;
    Promise.all([outletsApi.list(), staffApi.search(''), activationsApi.list(currentCampaignId)])
      .then(([o, s, a]) => { setOutlets(o?.data || []); setStaffList(s?.data || []); setActivationsList(a?.data || []); })
      .catch(() => {});
  }, [currentCampaignId]);

  function loadRecent() {
    if (!currentCampaignId) return;
    setRecentLoading(true);
    Promise.all([
      salesRecordsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
      dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
      attendanceApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
      salesFieldsApi.dayValues(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }).catch(() => null),
    ])
      .then(([salesRes, statsRes, attRes, fieldRes]) => {
        const salesRows = salesRes?.data || [];
        setRecentSales(salesRows);
        setDayFieldValues(fieldRes?.data || []);

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
  }
  useEffect(loadRecent, [currentCampaignId]);

  const last7Days = useMemo(() => {
    if (!recentSales) return [];
    const map = {};
    for (let i = 6; i >= 0; i--) {
      map[todayISO(-i)] = { date: todayISO(-i), items: [], totalSales: 0, totalUnits: 0, fields: [] };
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
    for (const f of dayFieldValues) {
      const day = String(f.date).slice(0, 10);
      if (map[day]) map[day].fields.push(f);
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [recentSales, dayFieldValues]);


  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  const filterSlot = (
    <div className="filter-bar">
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
    </div>
  );

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
        <div className="panel-sub">Select outlet, promoter, activation and date to correct sales and record custom fields.</div>
        <SalesCorrectionGrid campaignId={currentCampaignId} form={form} filterSlot={filterSlot} onSaved={loadRecent} />
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
                {day.fields.length > 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {day.fields.map((f, i) => (
                      <span key={i} style={{ marginRight: 12 }}>
                        <strong>{f.staffName}</strong> · {f.label}: {String(f.value)}
                      </span>
                    ))}
                  </div>
                ) : null}
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
