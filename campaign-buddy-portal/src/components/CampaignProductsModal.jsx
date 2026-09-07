import { useEffect, useState } from 'react';
import { campaigns as campaignsApi } from '../lib/endpoints';
import Modal from './Modal';
import Loader from './Loader';
import ErrorState from './ErrorState';

// Read-only list of every product in a campaign's catalog. The editable version
// is the /campaigns/:id/items page (the pencil/items row action).
export default function CampaignProductsModal({ campaign, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    setLoading(true); setError(null);
    campaignsApi.items(campaign.id)
      .then((res) => { if (!cancelled) setRows(res?.data || []); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load products.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaign]);

  return (
    <Modal
      open={!!campaign}
      title="Campaign Products"
      subtitle={campaign ? `${campaign.name} · read-only` : ''}
      onClose={onClose}
      width={620}
    >
      {loading ? <Loader /> : error ? <ErrorState message={error} /> : rows.length === 0 ? (
        <div className="empty-state"><div className="big">No products</div>This campaign has no products in its catalog yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Product</th><th>SKU</th><th>Price</th></tr></thead>
            <tbody>
              {rows.map((ci) => (
                <tr key={ci.id}>
                  <td className="cell-strong">{ci.item?.name || ci.itemId}</td>
                  <td className="cell-muted">{ci.item?.sku || '—'}</td>
                  <td>LKR {Number(ci.item?.unitPrice || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="modal-foot">
        <span className="cell-muted" style={{ fontSize: 12 }}>{rows.length} product{rows.length === 1 ? '' : 's'}</span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
