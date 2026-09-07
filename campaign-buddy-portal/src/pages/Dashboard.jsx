import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  dailyStats as dailyStatsApi,
  reports as reportsApi,
  salesRecords as salesApi,
  attendance as attendanceApi,
  activations as activationsApi,
  tracking as trackingApi,
} from '../lib/endpoints';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import CampaignMap from '../components/CampaignMap';
import TrendChart from '../components/TrendChart';

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
//   GET /campaigns/{id}/activations     -> [ Activation + outlet(lat/lng) ]  (outlet pins)
//   GET /campaigns/{id}/tracking/live   -> [{ staffName, outletName, checkedInSince, lastPosition }]
export default function Dashboard() {
  const { currentCampaignId, currentCampaign, persona } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ footFall: 0, approached: 0, converted: 0 });
  const [today, setToday] = useState({ outletCount: 0, totalSales: 0, footFall: 0, approached: 0 });
  const [yesterday, setYesterday] = useState({ outletCount: 0, totalSales: 0 });
  const [week, setWeek] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [interestProducts, setInterestProducts] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [liveStaff, setLiveStaff] = useState([]);

  const range = useMemo(() => {
    const start = currentCampaign?.startDate ? String(currentCampaign.startDate).slice(0, 10) : todayISO(-30);
    const end = currentCampaign?.endDate ? String(currentCampaign.endDate).slice(0, 10) : todayISO();
    return { from: start, to: end < todayISO() ? end : todayISO() };
  }, [currentCampaign]);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, weekSalesRes, weekAttRes, skuRes, campaignSalesRes, actRes, liveRes] = await Promise.all([
          dailyStatsApi.list(currentCampaignId, { dateFrom: range.from, dateTo: range.to }),
          salesApi.list(currentCampaignId, { dateFrom: todayISO(-6), dateTo: todayISO() }),
          attendanceApi.list(currentCampaignId, { dateFrom: todayISO(-1), dateTo: todayISO() }),
          reportsApi.skuWise(currentCampaignId, { dateFrom: range.from, dateTo: range.to }),
          salesApi.list(currentCampaignId, { dateFrom: range.from, dateTo: range.to }),
          activationsApi.list(currentCampaignId),
          trackingApi.live(currentCampaignId),
        ]);
        if (cancelled) return;

        setStats(statsRes?.data?.totals || { footFall: 0, approached: 0, converted: 0 });
        const days = statsRes?.data?.byDay || [];
        setByDay(statsByDay(days));

        const salesRows = weekSalesRes?.data || [];
        const attRows = weekAttRes?.data || [];
        const todayStat = dayStat(days, todayISO());
        setToday({ ...daySummary(salesRows, attRows, todayISO()), ...todayStat });
        setYesterday(daySummary(salesRows, attRows, todayISO(-1)));
        setWeek(salesByDay(salesRows));

        const skuRows = skuRes?.data || [];
        setTopProducts([...skuRows].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)).slice(0, 10));

        setInterestProducts(interestByProduct(campaignSalesRes?.data || []).slice(0, 8));

        setOutlets(uniqueOutlets(actRes?.data || []));
        setLiveStaff(liveRes?.data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentCampaignId, range.from, range.to]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar to see its dashboard." />;
  if (loading) return <Loader label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;

  const maxWeek = Math.max(1, ...week.map((w) => w.totalSales));
  const convRate = stats.approached ? Math.round((stats.converted / stats.approached) * 100) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub">{overviewSubtitle(currentCampaign, persona)}</p>
        </div>
      </div>
      <div className="stat-grid cols-5">
        <StatCard label="Sales Today" value={`LKR ${today.totalSales.toLocaleString()}`} />
        <StatCard label="Active Outlets Today" value={today.outletCount || '—'} />
        <StatCard label="Foot Fall Today" value={today.footFall || 0} />
        <StatCard label="Customers Approached Today" value={today.approached || 0} />
        <StatCard label="Sales Yesterday" value={`LKR ${yesterday.totalSales.toLocaleString()}`} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Outlets &amp; live sales staff</div>
        <div className="panel-sub">
          {outlets.length} outlet{outlets.length === 1 ? '' : 's'} · {liveStaff.length} staff checked in now
        </div>
        <div style={{ marginTop: 14 }}>
          <CampaignMap outlets={outlets} staff={liveStaff} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Footfall, approached &amp; conversion — daily</div>
        <div className="panel-sub">
          Campaign to date · {stats.approached.toLocaleString()} approached · {stats.converted.toLocaleString()} converted · {convRate}% conversion
        </div>
        <div style={{ marginTop: 14 }}>
          <TrendChart
            data={byDay}
            series={[
              { key: 'footFall', label: 'Foot fall', color: 'var(--info)' },
              { key: 'approached', label: 'Approached', color: 'var(--mango)' },
              { key: 'converted', label: 'Converted', color: 'var(--success)' },
            ]}
          />
        </div>
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
          <div className="panel-title">Most-requested products</div>
          <div className="panel-sub">Customers who asked but didn&apos;t buy, this activation</div>
          <div style={{ marginTop: 8 }}>
            {interestProducts.length === 0 ? <div className="cell-muted">No interest logged yet.</div> : interestProducts.map((p, i) => (
              <div className="rank-row" key={p.name || i}>
                <div className="rank-num">{i + 1}</div>
                <div><div className="rank-name">{p.name}</div><div className="rank-meta">{p.brandName || 'Interested customers'}</div></div>
                <div className="rank-val">{p.interested.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">Top 10 products by sales — this activation</div>
        <div className="panel-sub">{range.from} → {range.to}</div>
        <div style={{ marginTop: 8 }}>
          {topProducts.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : topProducts.map((p, i) => (
            <div className="rank-row" key={p.itemName || i}>
              <div className="rank-num">{i + 1}</div>
              <div><div className="rank-name">{p.itemName}</div><div className="rank-meta">{p.brandName} · {p.itemCount} units</div></div>
              <div className="rank-val">LKR {(p.totalSales || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function overviewSubtitle(campaign, persona) {
  if (!campaign) return persona === 'supervisor' ? 'Your outlets, today.' : 'This campaign, today.';
  const client = campaign.client?.clientName || campaign.client?.companyName || campaign.client?.name;
  const parts = [campaign.name, client].filter(Boolean);
  const dates = fmtDateRange(campaign.startDate, campaign.endDate);
  if (dates) parts.push(dates);
  return parts.join('  |  ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDateRange(from, to) {
  const f = fmtDate(from);
  const t = fmtDate(to);
  if (f && t) return `${f} – ${t}`;
  return f || t || '';
}
function fmtDate(v) {
  // Format the calendar date as written, without timezone drift.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return '';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
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

// Roll the per-(activation,day) DailyStats rows up to one row per calendar day.
function statsByDay(rows) {
  const map = {};
  for (const r of rows) {
    const day = String(r.date).slice(0, 10);
    const acc = map[day] || (map[day] = { date: day, footFall: 0, approached: 0, converted: 0 });
    acc.footFall += r.footFall || 0;
    acc.approached += r.approached || 0;
    acc.converted += r.converted || 0;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function dayStat(rows, isoDay) {
  return rows.filter((r) => String(r.date).slice(0, 10) === isoDay).reduce(
    (acc, r) => ({ footFall: acc.footFall + (r.footFall || 0), approached: acc.approached + (r.approached || 0) }),
    { footFall: 0, approached: 0 }
  );
}

function interestByProduct(salesRows) {
  const map = {};
  for (const r of salesRows) {
    const n = r.otherInterestedCustomers || 0;
    if (!n) continue;
    const item = r.activationItem?.campaignItem?.item;
    const name = item?.name || 'Unknown item';
    const acc = map[name] || (map[name] = { name, brandName: item?.brand?.name || '', interested: 0 });
    acc.interested += n;
  }
  return Object.values(map).sort((a, b) => b.interested - a.interested);
}

function uniqueOutlets(activationRows) {
  const map = new Map();
  for (const a of activationRows) {
    const o = a.outlet;
    if (o && !map.has(o.id)) map.set(o.id, o);
  }
  return [...map.values()];
}
