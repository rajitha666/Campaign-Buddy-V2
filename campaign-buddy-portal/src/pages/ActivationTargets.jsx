import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activations as activationsApi, campaigns as campaignsApi, items as itemsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Drawer from '../components/Drawer';

export default function ActivationTargets() {
  const { campaignId, activationId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [activation, setActivation] = useState(null);
  const [targets, setTargets] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [actRes, targetsRes, ciRes] = await Promise.all([
        activationsApi.get(campaignId, activationId),
        activationsApi.targets.list(campaignId, activationId),
        campaignsApi.items(campaignId),
      ]);
      setActivation(actRes?.data || null);
      setTargets(targetsRes?.data || []);
      const itemsRes = await itemsApi.list();
      const itemMap = Object.fromEntries((itemsRes?.data || []).map((i) => [i.id, i.name]));
      setItemOptions((ciRes?.data || []).map((ci) => ({ value: ci.itemId, label: itemMap[ci.itemId] || ci.itemId })));
    } catch (e) {
      setError(e.message || 'Could not load targets.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId, activationId]);

  const fields = [
    { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
    { key: 'repeat', label: 'Repeat', type: 'radio', options: [{ value: false, label: 'Disabled' }, { value: true, label: 'Enabled' }] },
    { key: 'targetItemId', label: 'Target Product', type: 'select', required: true, options: itemOptions },
    { key: 'targetValue', label: 'Target', type: 'text', required: true, placeholder: 'Quantity or LKR, per the activation\'s Target Unit' },
  ];

  async function handleSubmit(values) {
    await activationsApi.targets.create(campaignId, activationId, {
      dateFrom: values.dateRange?.[0], dateTo: values.dateRange?.[1],
      repeat: !!values.repeat, targetItemId: values.targetItemId, targetValue: Number(values.targetValue) || 0,
    });
    push('Target added');
    load();
  }

  return (
    <div>
      <div className="crumb-pill">
        <span>Campaign</span> » <b>{activation?.name || '…'}</b>
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate(-1)}>← Back to Activations</button>
      </div>
      <div className="page-head">
        <div><h1>Activation Targets</h1><p className="page-sub">Time-boxed, per-item numeric targets for this activation.</p></div>
        <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>+ Add Target</button>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="table-card">
          {targets.length === 0 ? (
            <div className="empty-state"><div className="big">No targets set yet</div>Add one to start tracking progress for this activation.</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>From</th><th>To</th><th>Product</th><th>Target</th><th>Repeat</th></tr></thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.id}>
                      <td>{t.dateFrom}</td><td>{t.dateTo}</td>
                      <td>{itemOptions.find((o) => o.value === t.targetItemId)?.label || t.targetItemId}</td>
                      <td>{t.targetValue}</td>
                      <td><span className={`badge ${t.repeat ? 'success' : 'muted'}`}>{t.repeat ? 'Enabled' : 'Disabled'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Drawer
        open={drawerOpen}
        title="Add Target" subtitle={activation?.name}
        fields={fields}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
