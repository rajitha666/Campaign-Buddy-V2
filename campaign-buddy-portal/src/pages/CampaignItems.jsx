import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaigns as campaignsApi, items as itemsApi } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

export default function CampaignItems() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { push } = useToast();
  const [campaignItems, setCampaignItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [pickItemId, setPickItemId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [ciRes, itemsRes] = await Promise.all([campaignsApi.items(campaignId), itemsApi.list()]);
      setCampaignItems(ciRes?.data || []);
      setAllItems(itemsRes?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load campaign items.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const itemMap = Object.fromEntries(allItems.map((i) => [i.id, i]));
  const linkedIds = new Set(campaignItems.map((ci) => ci.itemId));
  const available = allItems.filter((i) => !linkedIds.has(i.id));

  async function addItem() {
    if (!pickItemId) return;
    try {
      await campaignsApi.addItem(campaignId, { itemId: pickItemId });
      push('Item added to campaign');
      setPickItemId('');
      load();
    } catch (e) { push(e.message || 'Could not add item', 'error'); }
  }
  async function removeItem(campaignItemId) {
    try {
      await campaignsApi.removeItem(campaignId, campaignItemId);
      push('Item removed');
      load();
    } catch (e) { push(e.message || 'Could not remove item', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaign Items</h1>
          <p className="page-sub">Items sellable anywhere in this campaign — Activations later pick a subset of these.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/campaigns')}>← Back to Campaigns</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          {isAdmin ? (
            <div className="filter-bar">
              <div className="filter-field" style={{ minWidth: 260 }}>
                <label>Add item</label>
                <select value={pickItemId} onChange={(e) => setPickItemId(e.target.value)}>
                  <option value="">Select an item…</option>
                  {available.map((i) => <option key={i.id} value={i.id}>{i.name} — LKR {Number(i.unitPrice || 0).toLocaleString()}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={addItem} disabled={!pickItemId}>Add</button>
            </div>
          ) : null}
          <div className="table-card">
            {campaignItems.length === 0 ? (
              <div className="empty-state"><div className="big">No items yet</div>Add items above to build this campaign's catalog.</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Item</th><th>Price</th>{isAdmin ? <th>Action</th> : null}</tr></thead>
                  <tbody>
                    {campaignItems.map((ci) => {
                      const item = itemMap[ci.itemId] || {};
                      return (
                        <tr key={ci.id}>
                          <td className="cell-strong">{item.name || ci.itemId}</td>
                          <td>LKR {Number(item.unitPrice || 0).toLocaleString()}</td>
                          {isAdmin ? <td><div className="icon-btn delete" onClick={() => removeItem(ci.id)}>✕</div></td> : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
