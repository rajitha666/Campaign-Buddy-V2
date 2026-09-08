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

function Stepper({ value, onChange, max }) {
  const canDec = value > 0;
  const canInc = max === undefined || value < max;
  return (
    <div className="stepper">
      <button className="stepper-btn" disabled={!canDec} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span className="stepper-val">{value}</span>
      <button className="stepper-btn" disabled={!canInc} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function MetricCard({ icon, iconBg, title, subtitle, children }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <div className="metric-icon" style={{ backgroundColor: iconBg }}>{icon}</div>
        <div>
          <div className="metric-title">{title}</div>
          <div className="metric-sub">{subtitle}</div>
        </div>
      </div>
      <div className="metric-stepper">{children}</div>
    </div>
  );
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
  const [today, setToday] = useState({ totalSales: 0, outletCount: 0, footFall: 0, approached: 0, converted: 0 });
  const [week, setWeek] = useState([]);
  const [dayFieldValues, setDayFieldValues] = useState([]);

  const [statsFootFall, setStatsFootFall] = useState(null);
  const [statsApproached, setStatsApproached] = useState(null);
  const [statsConverted, setStatsConverted] = useState(null);
  const [statsSaving, setStatsSaving] = useState(false);

  useEffect(() => {
    if (!currentCampaignId) return;
    Promise.all([outletsApi.list(), staffApi.search(''), activationsApi.list(currentCampaignId)])
      .then(([o, s, a]) => { setOutlets(o?.data || []); setStaffList(s?.data || []); setActivationsList(a?.data || []); })
      .catch(() => {});
  }, [currentCampaignId]);

  function loadTodayStats() {
    if (!currentCampaignId) return;
    dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() })
      .then((res) => {
        const days = res?.data?.byDay || [];
        const todayStat = days.filter((r) => String(r.date).slice(0, 10) === todayISO()).reduce(
          (acc, r) => ({ footFall: acc.footFall + (r.footFall || 0), approached: acc.approached + (r.approached || 0), converted: acc.converted + (r.converted || 0) }),
          { footFall: 0, approached: 0, converted: 0 }
        );
        setStatsFootFall(todayStat.footFall);
        setStatsApproached(todayStat.approached);
        setStatsConverted(todayStat.converted);
      })
      .catch(() => { setStatsFootFall(0); setStatsApproached(0); setStatsConverted(0); });
  }

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
          (acc, r) => ({ footFall: acc.footFall + (r.footFall || 0), approached: acc.approached + (r.approached || 0), converted: acc.converted + (r.converted || 0) }),
          { footFall: 0, approached: 0, converted: 0 }
        );
        setToday({ totalSales, outletCount: outletIds.size, ...todayStat });
        setStatsFootFall(todayStat.footFall);
        setStatsApproached(todayStat.approached);
        setStatsConverted(todayStat.converted);

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

  async function saveTodayStats() {
    setStatsSaving(true);
    try {
      await dailyStatsApi.updateToday(currentCampaignId, {
        footFall: statsFootFall ?? 0,
        approached: statsApproached ?? 0,
        converted: statsConverted ?? 0,
      });
      push("Today's stats updated");
      loadTodayStats();
      dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() })
        .then((statsRes) => {
          const days = statsRes?.data?.byDay || [];
          const todayStat = days.filter((r) => String(r.date).slice(0, 10) === todayISO()).reduce(
            (acc, r) => ({ footFall: acc.footFall + (r.footFall || 0), approached: acc.approached + (r.approached || 0), converted: acc.converted + (r.converted || 0) }),
            { footFall: 0, approached: 0, converted: 0 }
          );
          setToday((t) => ({ ...t, ...todayStat }));
        })
        .catch(() => {});
    } catch (e) {
      push(e.message || 'Could not save stats', 'error');
    } finally {
      setStatsSaving(false);
    }
  }

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

  const conversionRate = statsApproached && statsApproached > 0 ? Math.round(((statsConverted ?? 0) / statsApproached) * 100) : 0;

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
        <div className="panel-title">Today's Sales</div>
        <div className="panel-sub">{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>

        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <MetricCard
            iconBg="#E8F0FE"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="8" r="3.4" stroke="#4285F4" strokeWidth="1.8"/></svg>}
            title="Foot fall"
            subtitle="Shoppers who entered the outlet"
          >
            <Stepper value={statsFootFall ?? 0} onChange={setStatsFootFall} />
          </MetricCard>

          <MetricCard
            iconBg="#FEF3E2"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 12h8M8 8h8M8 16h5" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            title="Approached"
            subtitle="Shoppers engaged by the team"
          >
            <Stepper value={statsApproached ?? 0} onChange={setStatsApproached} />
          </MetricCard>

          <MetricCard
            iconBg="#E6F7EF"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#22C55E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            title="Conversion"
            subtitle="Approached shoppers who purchased"
          >
            <Stepper value={statsConverted ?? 0} onChange={setStatsConverted} max={statsApproached ?? 0} />
          </MetricCard>
        </div>

        <div className="conv-summary">
          <span className="conv-label">Conversion rate</span>
          <span className="conv-value">{conversionRate}% of approached</span>
        </div>

        <button className="btn btn-primary" onClick={saveTodayStats} disabled={statsSaving} style={{ marginTop: 16 }}>
          {statsSaving ? 'Saving...' : 'Update'}
        </button>
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
