import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { activations as activationsApi, outlets as outletsApi, staff as staffApi } from '../lib/endpoints';
import ErrorState from '../components/ErrorState';
import SalesCorrectionGrid from '../components/SalesCorrectionGrid';

export default function UpdateSales() {
  const { currentCampaignId } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [activationsList, setActivationsList] = useState([]);
  const [form, setForm] = useState({ outletId: '', staffId: '', activationId: '', date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    if (!currentCampaignId) return;
    Promise.all([outletsApi.list(), staffApi.search(''), activationsApi.list(currentCampaignId)])
      .then(([o, s, a]) => { setOutlets(o?.data || []); setStaffList(s?.data || []); setActivationsList(a?.data || []); })
      .catch(() => {});
  }, [currentCampaignId]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  const filterSlot = (
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
    </div>
  );

  return (
    <div>
      <div className="page-head"><div><h1>Update Sales</h1><p className="page-sub">Manual correction screen for a promoter's daily sales.</p></div></div>
      <SalesCorrectionGrid campaignId={currentCampaignId} form={form} filterSlot={filterSlot} />
      <div className="hint-note" style={{ marginTop: 12 }}>
        Reads GET /admin/v1/campaigns/{'{id}'}/sales/lookup; saves stock via PATCH …/sales/{'{salesRecordId}'} and custom
        fields via PUT …/sales/custom-values. Rows with an existing SalesRecord have an id and can be corrected.
      </div>
    </div>
  );
}
