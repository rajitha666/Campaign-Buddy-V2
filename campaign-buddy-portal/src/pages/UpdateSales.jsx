import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { activations as activationsApi, outlets as outletsApi, staff as staffApi, salesLookup, salesRecords as salesRecordsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

export default function UpdateSales() {
  const { currentCampaignId } = useAuth();
  const { push } = useToast();
  const [outlets, setOutlets] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [activationsList, setActivationsList] = useState([]);
  const [form, setForm] = useState({ outletId: '', staffId: '', activationId: '', date: new Date().toISOString().slice(0, 10) });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentCampaignId) return;
    Promise.all([outletsApi.list(), staffApi.search(''), activationsApi.list(currentCampaignId)])
      .then(([o, s, a]) => { setOutlets(o?.data || []); setStaffList(s?.data || []); setActivationsList(a?.data || []); })
      .catch(() => {});
  }, [currentCampaignId]);

  async function loadSales() {
    setLoading(true); setError(null);
    try {
      const res = await salesLookup.load(currentCampaignId, form);
      setRows((res?.data || []).map((r) => ({ ...r, selected: false })));
    } catch (e) {
      setError(e.message || 'Could not load sales for this selection.');
    } finally {
      setLoading(false);
    }
  }

  function setCell(idx, key, val) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  }

  async function saveCorrections() {
    try {
      await Promise.all((rows || []).filter((r) => r.selected).map((r) =>
        salesRecordsApi.correct(currentCampaignId, r.id, { openingStock: Number(r.openingStock), soldToday: Number(r.soldToday) })
      ));
      push('Sales corrections saved');
    } catch (e) {
      push(e.message || 'Could not save corrections', 'error');
    }
  }

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  return (
    <div>
      <div className="page-head"><div><h1>Update Sales</h1><p className="page-sub">Manual correction screen for a promoter's daily sales.</p></div></div>
      <div className="filter-bar">
        <div className="filter-field"><label>Outlet</label>
          <select value={form.outletId} onChange={(e) => setForm((f) => ({ ...f, outletId: e.target.value }))}>
            <option value="">Select…</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="filter-field"><label>Promoter</label>
          <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}>
            <option value="">Select…</option>{staffList.map((s) => <option key={s.id} value={s.id}>{s.displayName || s.fullName}</option>)}
          </select>
        </div>
        <div className="filter-field"><label>Activation</label>
          <select value={form.activationId} onChange={(e) => setForm((f) => ({ ...f, activationId: e.target.value }))}>
            <option value="">Select…</option>{activationsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="filter-field"><label>Date</label>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={loadSales}>Load sales</button>
      </div>

      {loading ? <Loader /> : error ? <ErrorState message={error} /> : rows ? (
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th></th><th>Product</th><th>Unit Price</th><th>Initial Qty</th><th>Sold Qty</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td><input type="checkbox" checked={!!r.selected} onChange={(e) => setCell(i, 'selected', e.target.checked)} /></td>
                    <td className="cell-strong">{r.itemName}</td>
                    <td>LKR {Number(r.unitPrice || 0).toLocaleString()}</td>
                    <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.openingStock} onChange={(e) => setCell(i, 'openingStock', e.target.value)} /></td>
                    <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.soldToday} onChange={(e) => setCell(i, 'soldToday', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer"><span /><button className="btn btn-primary btn-sm" onClick={saveCorrections}>Save corrections</button></div>
        </div>
      ) : null}
      <div className="hint-note" style={{ marginTop: 12 }}>
        Reads GET /admin/v1/campaigns/{'{id}'}/sales/lookup (Backend Spec v3 §4.2); saves via PATCH /admin/v1/campaigns/{'{id}'}/sales/{'{salesRecordId}'}. Rows with an existing SalesRecord have an id and can be saved; days with no record yet return id:null.
      </div>
    </div>
  );
}
