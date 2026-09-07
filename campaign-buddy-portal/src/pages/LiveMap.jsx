import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { tracking as trackingApi, activations as activationsApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import LiveMapView from '../components/LiveMapView';

function uniqueOutlets(activationRows) {
  const map = new Map();
  for (const a of activationRows || []) {
    if (a.outlet && !map.has(a.outlet.id)) map.set(a.outlet.id, a.outlet);
  }
  return [...map.values()];
}

export default function LiveMap() {
  const { currentCampaignId, currentCampaign } = useAuth();
  const [live, setLive] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentCampaignId) { setLoading(false); return; }
    let cancelled = false;
    activationsApi.list(currentCampaignId)
      .then((res) => { if (!cancelled) setOutlets(uniqueOutlets(res?.data)); })
      .catch(() => {});
    async function load() {
      try {
        const res = await trackingApi.live(currentCampaignId);
        if (!cancelled) setLive(res?.data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load live positions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000); // matches the mobile app's ~foreground ping cadence
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentCampaignId]);

  if (!currentCampaignId) return <ErrorState message="No campaign is available for your account yet." />;

  return (
    <div>
      <div className="page-head">
        <div><h1>Seller Live Locations</h1><p className="page-sub">Live positions of checked-in staff for {currentCampaign?.name}.</p></div>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} /> : (
        <>
          <div className="panel"><LiveMapView pings={live} outlets={outlets} height={420} /></div>
          <div className="table-card" style={{ marginTop: 16 }}>
            <div className="table-toolbar"><div className="entries-select">Currently checked in ({live.length})</div></div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Promoter</th><th>Outlet</th><th>Checked in since</th></tr></thead>
                <tbody>
                  {live.map((p, i) => (
                    <tr key={`${p.staffName || ''}-${p.outletName || ''}-${i}`}>
                      <td>{p.staffName || p.userId}</td>
                      <td>{p.outletName || p.outletId}</td>
                      <td>{p.checkedInSince ? new Date(p.checkedInSince).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
