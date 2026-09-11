import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaigns as campaignsApi, activations as activationsApi, items as itemsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import ProductThumb from '../components/ProductThumb';

export default function ActivationItems() {
  const { campaignId, activationId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [campaignItems, setCampaignItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [attached, setAttached] = useState([]); // ActivationItem rows (campaignItemId)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [ciRes, itemsRes, aiRes] = await Promise.all([
        campaignsApi.items(campaignId),
        itemsApi.list(),
        activationsApi.items(campaignId, activationId),
      ]);
      setCampaignItems(ciRes?.data || []);
      setAllItems(itemsRes?.data || []);
      setAttached(aiRes?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load this activation\'s products.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId, activationId]);

  const itemMap = Object.fromEntries(allItems.map((i) => [i.id, i]));
  const attachedCampaignItemIds = new Set(attached.map((ai) => ai.campaignItemId));
  const attachedRowByCampaignItemId = Object.fromEntries(attached.map((ai) => [ai.campaignItemId, ai]));

  async function addOne(campaignItemId) {
    try {
      await activationsApi.addItems(campaignId, activationId, { campaignItemIds: [campaignItemId] });
      push('Product attached to activation');
      load();
    } catch (e) { push(e.message || 'Could not attach product', 'error'); }
  }
  async function addAll() {
    try {
      await activationsApi.addItems(campaignId, activationId, { addAll: true });
      push('All campaign products attached');
      load();
    } catch (e) { push(e.message || 'Could not attach products', 'error'); }
  }
  async function removeOne(campaignItemId) {
    const ai = attachedRowByCampaignItemId[campaignItemId];
    if (!ai) return;
    try {
      await activationsApi.removeItem(campaignId, activationId, ai.id);
      push('Product removed');
      load();
    } catch (e) { push(e.message || 'Could not remove product', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>Activation Products</h1><p className="page-sub">Pick which of this campaign's products are sold at this activation.</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={addAll} disabled={campaignItems.length === 0}>Add all</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} /> : campaignItems.length === 0 ? (
        <ErrorState message="This campaign has no products yet — add some under Campaigns → Products first." />
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Product</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {campaignItems.map((ci) => {
                  const item = itemMap[ci.itemId] || {};
                  const added = attachedCampaignItemIds.has(ci.id);
                  return (
                    <tr key={ci.id}>
                      <td className="cell-strong">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <ProductThumb item={item} />
                          {item.name || ci.itemId}
                        </span>
                      </td>
                      <td>LKR {Number(item.unitPrice || 0).toLocaleString()}</td>
                      <td>{added ? <span className="badge success">Attached</span> : <span className="badge muted">Not attached</span>}</td>
                      <td>{added
                        ? <button className="btn btn-secondary btn-sm" onClick={() => removeOne(ci.id)}>Remove</button>
                        : <button className="btn btn-secondary btn-sm" onClick={() => addOne(ci.id)}>Add</button>}</td>
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
