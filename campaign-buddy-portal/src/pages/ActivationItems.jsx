import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaigns as campaignsApi, activations as activationsApi, items as itemsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

// NOTE: the Unified Backend Spec only documents POST .../activations/{id}/items
// (§4.3) — there's no GET to list what's already attached, or a DELETE to
// remove one. This page can attach items but can only show what was added
// *this session*; ask the backend team to add a GET/DELETE pair so a page
// reload doesn't lose the attached list.
export default function ActivationItems() {
  const { campaignId, activationId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [campaignItems, setCampaignItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [addedThisSession, setAddedThisSession] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const [ciRes, itemsRes] = await Promise.all([campaignsApi.items(campaignId), itemsApi.list()]);
        setCampaignItems(ciRes?.data || []);
        setAllItems(itemsRes?.data || []);
      } catch (e) {
        setError(e.message || 'Could not load this campaign\'s item catalog.');
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignId]);

  const itemMap = Object.fromEntries(allItems.map((i) => [i.id, i]));

  async function addOne(campaignItemId) {
    try {
      await activationsApi.addItems(campaignId, activationId, { campaignItemIds: [campaignItemId] });
      setAddedThisSession((a) => [...new Set([...a, campaignItemId])]);
      push('Item attached to activation');
    } catch (e) { push(e.message || 'Could not attach item', 'error'); }
  }
  async function addAll() {
    const ids = campaignItems.map((ci) => ci.id);
    try {
      await activationsApi.addItems(campaignId, activationId, { campaignItemIds: ids });
      setAddedThisSession(ids);
      push('All campaign items attached');
    } catch (e) { push(e.message || 'Could not attach items', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Activation Items</h1><p className="page-sub">Pick which of this campaign's items are sold at this activation.</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={addAll} disabled={campaignItems.length === 0}>Add all</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} /> : campaignItems.length === 0 ? (
        <ErrorState message="This campaign has no items yet — add some under Campaigns → Items first." />
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Item</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {campaignItems.map((ci) => {
                  const item = itemMap[ci.itemId] || {};
                  const added = addedThisSession.includes(ci.id);
                  return (
                    <tr key={ci.id}>
                      <td className="cell-strong">{item.name || ci.itemId}</td>
                      <td>LKR {Number(item.unitPrice || 0).toLocaleString()}</td>
                      <td>{added ? <span className="badge success">Attached</span> : <span className="badge muted">Not attached</span>}</td>
                      <td>{!added ? <button className="btn btn-secondary btn-sm" onClick={() => addOne(ci.id)}>Add</button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
