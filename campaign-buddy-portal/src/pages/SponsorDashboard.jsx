import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  dailyStats as dailyStatsApi,
  reports as reportsApi,
  tracking as trackingApi,
  salesRecords as salesApi,
  attendance as attendanceApi,
  activations as activationsApi,
} from '../lib/endpoints';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import LiveMapView from '../components/LiveMapView';

function todayISO(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }

export default function SponsorDashboard() {
  const { currentCampaignId, currentCampaign } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [today, setToday] = useState({ outletCount: 0, totalSales: 0, footFall: 0 });
  const [live, setLive] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [statsRes, liveRes, skuRes, salesRes, attRes, actRes] = await Promise.all([
          dailyStatsApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
          trackingApi.live(currentCampaignId),
          reportsApi.skuWise(currentCampaignId, { dateFrom: todayISO(-30), dateTo: todayISO() }),
          salesApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
          attendanceApi.list(currentCampaignId, { dateFrom: todayISO(), dateTo: todayISO() }),
          activationsApi.list(currentCampaignId).catch(() => null),
        ]);
        if (cancelled) return;
        const outletMap = new Map();
        for (const a of actRes?.data || []) { if (a.outlet && !outletMap.has(a.outlet.id)) outletMap.set(a.outlet.id, a.outlet); }
        setOutlets([...outletMap.values()]);
        const totals = statsRes?.data?.totals || { footFall: 0 };
        const salesRows = salesRes?.data || [];
        const attRows = attRes?.data || [];
        const totalSales = salesRows.reduce(
          (s, r) => s + (r.soldToday || 0) * (r.activationItem?.campaignItem?.item?.unitPrice ?? 0),
          0
        );
        const outletIds = new Set(
          attRows.filter((a) => a.checkInAt).map((a) => a.activation?.outletId).filter(Boolean)
        );
        setToday({ outletCount: outletIds.size, totalSales, footFall: totals.footFall || 0 });
        setLive(liveRes?.data || []);
        setTopProducts([...(skuRes?.data || [])].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 3));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load campaign overview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentCampaignId]);

  if (!currentCampaignId) return <ErrorState message="No campaign is available for your account yet." />;
  if (loading) return <Loader label="Loading campaign overview…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <div className="page-head">
        <div><h1>{currentCampaign?.name || 'Campaign'}</h1><p className="page-sub">Live campaign overview</p></div>
      </div>
      <div className="stat-grid">
        <StatCard label="Sales Today" value={`LKR ${today.totalSales.toLocaleString()}`} />
        <StatCard label="Foot Fall Today" value={today.footFall} />
        <StatCard label="Outlets Live Now" value={`${live.length} checked in`} />
        <StatCard label="Active Outlets Today" value={today.outletCount} />
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Seller live locations</div>
        <div className="panel-sub">Foreground-tracked, updates while a promoter is checked in.</div>
        <div style={{ marginTop: 14 }}><LiveMapView pings={live} outlets={outlets} /></div>
      </div>
      <div className="panel">
        <div className="panel-title">Top products (last 30 days)</div>
        <div style={{ marginTop: 8 }}>
          {topProducts.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : topProducts.map((p, i) => (
            <div className="rank-row" key={p.itemName || i}>
              <div className="rank-num">{i + 1}</div>
              <div><div className="rank-name">{p.itemName}</div><div className="rank-meta">{p.brandName} · LKR {(p.totalSales || 0).toLocaleString()}</div></div>
              <div className="rank-val">{p.itemCount} sold</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
