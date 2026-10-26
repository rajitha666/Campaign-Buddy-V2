import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  dashboard as dashboardApi,
  activations as activationsApi,
  tracking as trackingApi,
} from '../lib/endpoints';
import StatCard from '../components/StatCard';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import CampaignMap from '../components/CampaignMap';
import TrendChart from '../components/TrendChart';
import { formatDelta, formatMoney, daysAgoLabel, fmtDayShort, lastDays } from '../lib/dashboardView';

// Attention-first Overview (#114). Everything on the page comes from ONE call,
//   GET /campaigns/{id}/dashboard
// (headline numbers + comparisons, ranked "needs attention", previous sales day,
// trend, rankings, setup state). The map is the only extra: it needs outlet
// coordinates and live positions, so it loads after the summary and is skipped
// for sponsors, who never see staff or location data.
export default function Dashboard() {
  const { currentCampaignId, currentCampaign, persona } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [liveStaff, setLiveStaff] = useState([]);
  const [trendDays, setTrendDays] = useState(7);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardApi.get(currentCampaignId);
        if (cancelled) return;
        setData(res?.data || null);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled || persona === 'sponsor') return;
      try {
        const [actRes, liveRes] = await Promise.all([activationsApi.list(currentCampaignId), trackingApi.live(currentCampaignId)]);
        if (cancelled) return;
        setOutlets(uniqueOutlets(actRes?.data || []));
        setLiveStaff(liveRes?.data || []);
      } catch {
        /* the map is optional — the rest of the page stands without it */
      }
    })();
    return () => { cancelled = true; };
  }, [currentCampaignId, persona]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar to see its dashboard." />;
  if (loading) return <Loader label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <ErrorState message="No dashboard data for this campaign." />;

  const isSponsor = data.view === 'sponsor';
  const { headline: h, previousSalesDay: prev, campaignProgress: prog, outletRanking: rank } = data;
  const trend = lastDays(data.trend || [], trendDays);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub">{overviewSubtitle(currentCampaign, persona)}</p>
        </div>
      </div>

      {!data.setup.complete ? (
        <SetupChecklist setup={data.setup} campaignId={currentCampaignId} canEdit={persona === 'admin'} />
      ) : (
        <>
          {prog ? (
            <div className="ov-progress">
              <b>Day {prog.day} of {prog.totalDays}</b> · {prog.daysLeft} day{prog.daysLeft === 1 ? '' : 's'} left
              <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.percent} aria-label="Campaign progress">
                <div className="fill" style={{ width: `${prog.percent}%` }} />
              </div>
            </div>
          ) : null}

          {!isSponsor ? <AttentionStrip items={data.attention || []} /> : null}

          <div className="stat-grid">
            <StatCard label="Sales today" value={formatMoney(h.sales.value)} {...delta(h.sales)} />
            <StatCard label="Active outlets" value={`${h.activeOutlets.value} of ${h.activeOutlets.planned}`}
              delta={h.activeOutlets.value < h.activeOutlets.planned ? `${h.activeOutlets.planned - h.activeOutlets.value} planned with no activity yet` : 'All planned outlets active'}
              deltaDirection={h.activeOutlets.value < h.activeOutlets.planned ? 'down' : 'up'} />
            <StatCard label="Conversion" value={`${h.conversionPct.value}%`} {...delta(h.conversionPct)} />
            <StatCard label="Customers approached" value={h.approached.value.toLocaleString()} {...delta(h.approached)} />
          </div>

          <div className="panel ov-block">
            <div className="panel-title">
              Last sales day{prev ? ` · ${fmtDayShort(prev.date)}` : ''}
            </div>
            {prev ? (
              <>
                <div className="panel-sub">{daysAgoLabel(prev.daysAgo)}</div>
                <div className="stat-grid" style={{ marginTop: 12, marginBottom: 0 }}>
                  <StatCard label="Sales" value={formatMoney(prev.sales)} />
                  <StatCard label="Units sold" value={prev.units.toLocaleString()} />
                  <StatCard label="Outlets with sales" value={prev.outlets} />
                  <StatCard label="Conversion" value={`${prev.conversionPct}%`} delta={`${prev.approached.toLocaleString()} approached · ${prev.converted.toLocaleString()} converted`} deltaDirection="flat" />
                </div>
              </>
            ) : (
              <div className="cell-muted" style={{ marginTop: 8 }}>No earlier sales yet.</div>
            )}
          </div>

          {!isSponsor ? (
            <div className="panel ov-block">
              <div className="panel-title">Outlets &amp; live sales staff</div>
              <div className="panel-sub">
                {outlets.length} outlet{outlets.length === 1 ? '' : 's'} · {liveStaff.length} staff checked in now
              </div>
              <div style={{ marginTop: 14 }}>
                <CampaignMap outlets={outlets} staff={liveStaff} />
              </div>
            </div>
          ) : null}

          <div className="panel ov-block">
            <div className="ov-tabs" role="group" aria-label="Trend range">
              {[7, 30].map((d) => (
                <button key={d} type="button" aria-pressed={trendDays === d} onClick={() => setTrendDays(d)}>{d} days</button>
              ))}
            </div>
            <div className="panel-title">Sales trend</div>
            <div className="panel-sub">Daily sales, last {trendDays} days</div>
            <div style={{ marginTop: 14 }}>
              <TrendChart data={trend} series={[{ key: 'sales', label: 'Sales', color: 'var(--mango)' }]} />
            </div>
            <details style={{ marginTop: 10 }}>
              <summary className="cell-muted">View as table</summary>
              <table className="data-table" aria-label="Daily sales">
                <thead><tr><th>Date</th><th>Sales</th><th>Approached</th><th>Converted</th></tr></thead>
                <tbody>
                  {[...trend].reverse().map((d) => (
                    <tr key={d.date}><td>{fmtDayShort(d.date)}</td><td>{formatMoney(d.sales)}</td><td>{d.approached}</td><td>{d.converted}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>

          <div className="ov-three">
            <RankPanel title="Best outlets" sub={`Last ${rank.days} days`} rows={rank.top} value={(r) => formatMoney(r.sales)} name={(r) => r.name} empty="No outlet sales yet." />
            <RankPanel title="Lagging outlets" sub="Lowest sales, zero-sales included" rows={rank.lagging} value={(r) => formatMoney(r.sales)} name={(r) => r.name} empty="Nothing lagging." />
            <RankPanel title="Unmet demand" sub="Customers who asked but didn't buy" rows={data.unmetDemand} value={(r) => r.interested.toLocaleString()} name={(r) => r.itemName} empty="No interest logged yet." />
          </div>

          <div className="panel">
            <div className="panel-title">Top 10 products by sales</div>
            <div className="panel-sub">Campaign to date</div>
            <div style={{ marginTop: 8 }}>
              {data.topProducts.length === 0 ? <div className="cell-muted">No sales recorded yet.</div> : data.topProducts.map((p, i) => (
                <div className="rank-row" key={`${p.itemName}-${i}`}>
                  <div className="rank-num">{i + 1}</div>
                  <div><div className="rank-name">{p.itemName}</div><div className="rank-meta">{p.brandName} · {p.units.toLocaleString()} units</div></div>
                  <div className="rank-val">{formatMoney(p.sales)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function delta(metric) {
  const d = formatDelta(metric.vsYesterdayPct, 'yesterday') || formatDelta(metric.vsLastWeekPct, 'last week');
  return d ? { delta: d.text, deltaDirection: d.direction } : {};
}

function AttentionStrip({ items }) {
  return (
    <section className="panel ov-block" aria-label="Needs attention">
      <div className="panel-title">Needs attention</div>
      {items.length === 0 ? (
        <div className="attn-clear">✓ All clear — nothing needs your attention.</div>
      ) : (
        <div className="attn-list">
          {items.map((i) => (
            <Link key={i.type} to={i.link} className={`attn-row ${i.severity}`}>
              <b>{i.count}</b>
              <span>{i.label.replace(/^\d+\s/, '')}</span>
              <span className="go">Fix →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SetupChecklist({ setup, campaignId, canEdit }) {
  const step = (done, text, to) => (
    <li>{done ? '✅' : '⬜'} {text}{!done && canEdit && to ? <> — <Link to={to}>set up</Link></> : null}</li>
  );
  return (
    <section className="panel ov-setup" aria-label="Set up your campaign">
      <div className="panel-title">Set up your campaign</div>
      <ul>
        {step(setup.products > 0, `Products added (${setup.products})`, `/campaigns/${campaignId}/items`)}
        {step(setup.activations > 0, `Activations created (${setup.activations})`, '/activations')}
        {step(setup.promotersAssigned > 0, `Promoters assigned (${setup.promotersAssigned})`, '/activations')}
      </ul>
      <p className="panel-sub">Your numbers appear here once the first promoter checks in.</p>
    </section>
  );
}

function RankPanel({ title, sub, rows, value, name, empty }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div className="panel-sub">{sub}</div>
      <div style={{ marginTop: 8 }}>
        {rows.length === 0 ? <div className="cell-muted">{empty}</div> : rows.map((r, i) => (
          <div className="rank-row" key={`${name(r)}-${i}`}>
            <div className="rank-num">{i + 1}</div>
            <div className="rank-name">{name(r)}</div>
            <div className="rank-val">{value(r)}</div>
          </div>
        ))}
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

function uniqueOutlets(activationRows) {
  const map = new Map();
  for (const a of activationRows) {
    const o = a.outlet;
    if (o && !map.has(o.id)) map.set(o.id, o);
  }
  return [...map.values()];
}
