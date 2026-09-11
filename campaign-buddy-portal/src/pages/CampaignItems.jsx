import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaigns as campaignsApi, items as itemsApi } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import ProductThumb from '../components/ProductThumb';

export default function CampaignItems() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { push } = useToast();
  const [campaignItems, setCampaignItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [ciRes, itemsRes] = await Promise.all([campaignsApi.items(campaignId), itemsApi.list()]);
      setCampaignItems(ciRes?.data || []);
      setAllItems(itemsRes?.data || []);
    } catch (e) {
      setError(e.message || 'Could not load campaign products.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const itemMap = Object.fromEntries(allItems.map((i) => [i.id, i]));
  const linkedIds = new Set(campaignItems.map((ci) => ci.itemId));
  const available = allItems.filter((i) => !linkedIds.has(i.id));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? available.filter((i) => i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q))
    : available;

  function toggleSelected(itemId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }
  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const allFilteredSelected = filtered.length > 0 && filtered.every((i) => prev.has(i.id));
      const next = new Set(prev);
      filtered.forEach((i) => { if (allFilteredSelected) next.delete(i.id); else next.add(i.id); });
      return next;
    });
  }

  async function addSelected() {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      await campaignsApi.addItem(campaignId, { itemIds: Array.from(selectedIds) });
      push(`${selectedIds.size} product${selectedIds.size === 1 ? '' : 's'} added to campaign`);
      setSelectedIds(new Set());
      setSearch('');
      load();
    } catch (e) { push(e.message || 'Could not add products', 'error'); }
    finally { setAdding(false); }
  }
  async function removeItem(campaignItemId) {
    try {
      await campaignsApi.removeItem(campaignId, campaignItemId);
      push('Product removed');
      load();
    } catch (e) { push(e.message || 'Could not remove product', 'error'); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaign Products</h1>
          <p className="page-sub">Products sellable anywhere in this campaign — Activations later pick a subset of these.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/campaigns')}>← Back to Campaigns</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          {isAdmin ? (
            <div className="table-card" style={{ marginBottom: 16 }}>
              <div className="filter-bar">
                <div className="filter-field" style={{ minWidth: 260 }}>
                  <label>Search products</label>
                  <input
                    type="text"
                    placeholder="Search by name or SKU…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary btn-sm" onClick={addSelected} disabled={selectedIds.size === 0 || adding}>
                  {adding ? 'Adding…' : `Add Selected${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
                </button>
              </div>
              {available.length === 0 ? (
                <div className="empty-state"><div className="big">All products linked</div>Every product in the catalog is already part of this campaign.</div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">No products match "{search}".</div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            checked={filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id))}
                            onChange={toggleSelectAllFiltered}
                          />
                        </th>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((i) => (
                        <tr key={i.id}>
                          <td><input type="checkbox" checked={selectedIds.has(i.id)} onChange={() => toggleSelected(i.id)} /></td>
                          <td className="cell-strong">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <ProductThumb item={i} />
                              {i.name}
                            </span>
                          </td>
                          <td className="cell-muted">{i.sku || '—'}</td>
                          <td>LKR {Number(i.unitPrice || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
          <div className="table-card">
            {campaignItems.length === 0 ? (
              <div className="empty-state"><div className="big">No products yet</div>Add products above to build this campaign's catalog.</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Product</th><th>Price</th>{isAdmin ? <th>Action</th> : null}</tr></thead>
                  <tbody>
                    {campaignItems.map((ci) => {
                      const item = itemMap[ci.itemId] || {};
                      return (
                        <tr key={ci.id}>
                          <td className="cell-strong">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <ProductThumb item={item} />
                              {item.name || ci.itemId}
                            </span>
                          </td>
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
