import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dailyStats as dailyStatsApi, reports as reportsApi } from '../lib/endpoints';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// NOTE: the Unified Backend Spec has no single "/dashboard" endpoint — this
// page composes GET /campaigns/{id}/stats + /reports/sku-wise client-side.
// Consider adding a dedicated aggregation endpoint if this gets slow at scale.
export default function Dashboard() {
  const { currentCampaignId, persona } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [today, setToday] = useState(null);
  const [yesterday, setYesterday] = useState(null);
  const [week, setWeek] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [todayRes, yestRes, weekRes, skuRes] = await Promise.all([
          dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
          dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(-1), dateTo: todayISO(-1) }),
          dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
          reportsApi.skuWise(currentCampaignId, { dateFrom: todayISO(-30), dateTo: todayISO() }),
        ]);
        if (cancelled) return;
        setToday(summarize(todayRes?.data));
        setYesterday(summarize(yestRes?.data));
        setWeek(groupByDate(weekRes?.data));
        setTopProducts((skuRes?.data || []).slice(0, 3));
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
        <StatCard label="Active Outlets Today" value={today?.outletCount ?? '—'} />
        <StatCard label="Sales Today" value={`LKR ${(today?.totalSales ?? 0).toLocaleString()}`} />
        <StatCard label="Active Outlets Yesterday" value={yesterday?.outletCount ?? '—'} />
        <StatCard label="Sales Yesterday" value={`LKR ${(yesterday?.totalSales ?? 0).toLocaleString()}`} />
      </div>
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-title">Sales this week</div>
          <div className="panel-sub">Last 7 days</div>
          <div className="bars-row">
            {week.map((w, i) => (
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
              <div className="rank-row" key={p.itemId || i}>
                <div className="rank-num">{i + 1}</div>
                <div><div className="rank-name">{p.itemName}</div><div className="rank-meta">{p.brandName}</div></div>
                <div className="rank-val">{p.itemCount} units</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function summarize(rows = []) {
  const outletIds = new Set();
  let totalSales = 0;
  rows.forEach((r) => { if (r.outletId) outletIds.add(r.outletId); totalSales += r.totalSales || 0; });
  return { outletCount: outletIds.size, totalSales };
}
function groupByDate(rows = []) {
  const map = {};
  rows.forEach((r) => { map[r.date] = (map[r.date] || 0) + (r.totalSales || 0); });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, totalSales]) => ({ date, totalSales }));
}
