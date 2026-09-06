import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  dailyStats as dailyStatsApi,
  reports as reportsApi,
  salesRecords as salesApi,
  attendance as attendanceApi,
} from '../lib/endpoints';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// The v3 backend has no single "/dashboard" endpoint and no per-day sales
// rollup. This page composes it client-side from the real endpoints:
//   GET /campaigns/{id}/stats           -> { totals:{footFall,approached,converted}, byDay:[] }
//   GET /campaigns/{id}/sales           -> [ SalesRecord + activationItem.campaignItem.item + activation.outlet ]
//   GET /campaigns/{id}/attendance      -> [ AttendanceRecord + activation.outlet ]
//   GET /campaigns/{id}/reports/sku-wise-> [{ itemName, brandName, itemCount, totalSales }] (+ meta.grandTotal)
export default function Dashboard() {
  const { currentCampaignId, persona } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ footFall: 0, approached: 0, converted: 0 });
  const [today, setToday] = useState({ outletCount: 0, totalSales: 0 });
  const [yesterday, setYesterday] = useState({ outletCount: 0, totalSales: 0 });
  const [week, setWeek] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, weekSalesRes, weekAttRes, skuRes] = await Promise.all([
          dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
          salesApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
          attendanceApi.list(currentCampaignId, { dateFrom: todayISO(-1), dateTo: todayISO() }),
          reportsApi.skuWise(currentCampaignId, { dateFrom: todayISO(-30), dateTo: todayISO() }),
        ]);
        if (cancelled) return;

        setStats(statsRes?.data?.totals || { footFall: 0, approached: 0, converted: 0 });

        const salesRows = weekSalesRes?.data || [];
        const attRows = weekAttRes?.data || [];
        setToday(daySummary(salesRows, attRows, todayISO()));
        setYesterday(daySummary(salesRows, attRows, todayISO(-1)));
        setWeek(salesByDay(salesRows));

        const skuRows = skuRes?.data || [];
        setTopProducts([...skuRows].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 3));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentCampaignId]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar to see its dashboard." />;
  if (loading) return <Loader label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;

  const maxWeek = Math.max(1, ...week.map((w) => w.totalSales));

  return (
    <div>
      <div className="page-head">
        <div><h1>Overview</h1><p className="page-sub">{persona === 'supervisor' ? 'Your outlets, today.' : 'This campaign, today.'}</p></div>
      </div>
      <div className="stat-grid">
        <StatCard label="Sales Today" value={`LKR ${today.totalSales.toLocaleString()}`} />
        <StatCard label="Active Outlets Today" value={today.outletCount || '—'} />
        <StatCard label="Sales Yesterday" value={`LKR ${yesterday.totalSales.toLocaleString()}`} />
        <StatCard label="Foot Fall Today" value={stats.footFall} />
      </div>
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-title">Sales this week</div>
          <div className="panel-sub">Last 7 days</div>
          <div className="bars-row">
            {week.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : week.map((w, i) => (
              <div className="bar-col" key={w.date}>
                <div className={`bar ${i === week.length - 1 ? 'today' : ''}`} style={{ height: `${Math.max(6, (w.totalSales / maxWeek) * 130)}px` }} />
                <div className="day">{w.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Top products (last 30 days)</div>
          <div style={{ marginTop: 8 }}>
            {topProducts.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : topProducts.map((p, i) => (
              <div className="rank-row" key={p.itemName || i}>
                <div className="rank-num">{i + 1}</div>
                <div><div className="rank-name">{p.itemName}</div><div className="rank-meta">{p.brandName} · LKR {(p.totalSales || 0).toLocaleString()}</div></div>
                <div className="rank-val">{p.itemCount} units</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A SalesRecord row from GET /campaigns/{id}/sales carries the joined
// activationItem.campaignItem.item (for unitPrice) and activation.outlet.
function saleValue(r) {
  const price = r.activationItem?.campaignItem?.item?.unitPrice ?? 0;
  return (r.soldToday || 0) * price;
}

function daySummary(salesRows, attRows, isoDay) {
  const sales = salesRows.filter((r) => String(r.date).slice(0, 10) === isoDay);
  const totalSales = sales.reduce((s, r) => s + saleValue(r), 0);
  const outletIds = new Set(
    attRows
      .filter((a) => String(a.date).slice(0, 10) === isoDay && a.checkInAt)
      .map((a) => a.activation?.outletId)
      .filter(Boolean)
  );
  return { totalSales, outletCount: outletIds.size };
}

function salesByDay(salesRows) {
  const map = {};
  for (const r of salesRows) {
    const day = String(r.date).slice(0, 10);
    map[day] = (map[day] || 0) + saleValue(r);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalSales]) => ({ date, totalSales }));
}
