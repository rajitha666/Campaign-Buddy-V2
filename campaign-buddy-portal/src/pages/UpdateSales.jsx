import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { outlets as outletsApi } from '../lib/endpoints';
import ErrorState from '../components/ErrorState';
import SalesCorrectionGrid from '../components/SalesCorrectionGrid';
import SearchableSelect from '../components/SearchableSelect';
import { applyDesignationLabel } from '../lib/designationLabel';

export default function UpdateSales() {
  const { currentCampaignId, designationLabel } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [form, setForm] = useState({ outletId: '', date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    if (!currentCampaignId) return;
    outletsApi.list({ pageSize: 1000 }).then((o) => setOutlets(o?.data || [])).catch(() => {});
  }, [currentCampaignId]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  // Only Outlet + Date are picked here. Promoter and Activation are derived
  // from the activation covering this outlet on the selected date — the
  // sales/lookup backend resolves that pair and the grid shows the answer
  // (meta.staffName / meta.activationName) above the table.
  const outletOptions = outlets.map((o) => ({ value: o.id, label: o.name }));

  const filterSlot = (
    <div className="filter-bar">
      <div className="filter-field"><label>Outlet</label>
        <SearchableSelect options={outletOptions} value={form.outletId} onChange={(v) => setForm((f) => ({ ...f, outletId: v }))} placeholder="Search outlets…" />
      </div>
      <div className="filter-field"><label>Date</label>
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-head"><div><h1>Update Sales</h1><p className="page-sub">{applyDesignationLabel("Manual correction screen for a promoter's daily sales.", designationLabel)}</p></div></div>
      <SalesCorrectionGrid campaignId={currentCampaignId} form={form} filterSlot={filterSlot} />
      <div className="hint-note" style={{ marginTop: 12 }}>
        Reads GET /admin/v1/campaigns/{'{id}'}/sales/lookup; saves stock via PATCH …/sales/{'{salesRecordId}'} and custom
        fields via PUT …/sales/custom-values. Rows with an existing SalesRecord have an id and can be corrected.
      </div>
    </div>
  );
}
