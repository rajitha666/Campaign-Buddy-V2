import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { activations as activationsApi, outlets as outletsApi, staff as staffApi } from '../lib/endpoints';
import ErrorState from '../components/ErrorState';
import SalesCorrectionGrid from '../components/SalesCorrectionGrid';
import SearchableSelect from '../components/SearchableSelect';
import { staffLabel } from '../lib/staffLabel';

function dedupeByValue(options) {
  const seen = new Set();
  return options.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
}

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

  // Auto-pick promoter + activation from the selected outlet (issue #37).
  // Only auto-select when the outlet maps to exactly one Activation; if it has
  // none or several, clear any stale pick from a previous outlet and leave it
  // to the (now outlet-scoped) dropdowns below for a manual choice.
  useEffect(() => {
    if (!form.outletId) return;
    const matches = activationsList.filter((a) => a.outletId === form.outletId);
    setForm((f) => (matches.length === 1
      ? { ...f, activationId: matches[0].id, staffId: matches[0].staffId }
      : { ...f, activationId: '', staffId: '' }));
  }, [form.outletId, activationsList]);

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  // Once an outlet is chosen, narrow Promoter/Activation to that outlet's own
  // activations instead of the full campaign-wide lists.
  const outletActivations = form.outletId ? activationsList.filter((a) => a.outletId === form.outletId) : activationsList;
  const outletOptions = outlets.map((o) => ({ value: o.id, label: o.name }));
  const staffOptions = form.outletId
    ? dedupeByValue(outletActivations.map((a) => ({ value: a.staffId, label: staffLabel(a.staff) })))
    : staffList.map((s) => ({ value: s.id, label: staffLabel(s) }));
  const activationOptions = outletActivations.map((a) => ({ value: a.id, label: a.name }));

  const filterSlot = (
    <div className="filter-bar">
      <div className="filter-field"><label>Outlet</label>
        <SearchableSelect options={outletOptions} value={form.outletId} onChange={(v) => setForm((f) => ({ ...f, outletId: v }))} placeholder="Search outlets…" />
      </div>
      <div className="filter-field"><label>Promoter</label>
        <SearchableSelect options={staffOptions} value={form.staffId} onChange={(v) => setForm((f) => ({ ...f, staffId: v }))} placeholder="Search promoters…" />
      </div>
      <div className="filter-field"><label>Activation</label>
        <SearchableSelect options={activationOptions} value={form.activationId} onChange={(v) => setForm((f) => ({ ...f, activationId: v }))} placeholder="Search activations…" />
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
