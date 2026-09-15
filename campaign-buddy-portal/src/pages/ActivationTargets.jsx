import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activations as activationsApi } from '../lib/endpoints';
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
  const [brandOptions, setBrandOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [actRes, targetsRes, aiRes] = await Promise.all([
        activationsApi.get(campaignId, activationId),
        activationsApi.targets.list(campaignId, activationId),
        activationsApi.items(campaignId, activationId),
      ]);
      setActivation(actRes?.data || null);
      setTargets(targetsRes?.data || []);

      const activationItems = aiRes?.data || [];
      setItemOptions(activationItems.map((ai) => {
        const item = ai.campaignItem?.item;
        return { value: item?.id, label: item?.name || item?.id };
      }));
      const brandMap = new Map();
      activationItems.forEach((ai) => {
        const brand = ai.campaignItem?.item?.brand;
        if (brand) brandMap.set(brand.id, brand.name);
      });
      setBrandOptions([...brandMap].map(([value, label]) => ({ value, label })));
    } catch (e) {
      setError(e.message || 'Could not load targets.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId, activationId]);

  const isBrandWise = activation?.targetType === 'brand_wise';

  const fields = [
    { key: 'dateRange', label: 'Date range', type: 'daterange', required: true },
    { key: 'repeat', label: 'Repeat', type: 'radio', options: [{ value: false, label: 'Disabled' }, { value: true, label: 'Enabled' }] },
    isBrandWise
      ? { key: 'targetBrandId', label: 'Target Brand', type: 'searchable-select', required: true, options: brandOptions, placeholder: 'Search brands…' }
      : { key: 'targetItemId', label: 'Target Product', type: 'searchable-select', required: true, options: itemOptions, placeholder: 'Search products…' },
    { key: 'targetValue', label: 'Target', type: 'text', required: true, placeholder: 'Quantity or LKR, per the activation\'s Target Unit' },
  ];

  async function handleSubmit(values) {
    await activationsApi.targets.create(campaignId, activationId, {
      dateFrom: values.dateRange?.[0], dateTo: values.dateRange?.[1],
      repeat: !!values.repeat,
      ...(isBrandWise ? { targetBrandId: values.targetBrandId } : { targetItemId: values.targetItemId }),
      targetValue: Number(values.targetValue) || 0,
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
                <thead><tr><th>From</th><th>To</th><th>Target</th><th>Value</th><th>Achieved</th><th>Progress</th><th>Repeat</th></tr></thead>
                <tbody>
                  {targets.map((t) => {
                    const label = t.targetBrandId
                      ? `${brandOptions.find((o) => o.value === t.targetBrandId)?.label || t.targetBrandId} (Brand)`
                      : (itemOptions.find((o) => o.value === t.targetItemId)?.label || t.targetItemId);
                    const percent = Math.min(t.percent ?? 0, 100);
                    return (
                      <tr key={t.id}>
                        <td>{t.dateFrom}</td><td>{t.dateTo}</td>
                        <td>{label}</td>
                        <td>{t.targetValue}</td>
                        <td>{t.achieved ?? 0}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                              <div style={{ width: `${percent}%`, height: '100%', background: percent >= 100 ? 'var(--success, #2e7d32)' : 'var(--primary, #4f46e5)' }} />
                            </div>
                            <span className="cell-muted" style={{ fontSize: 12 }}>{t.percent ?? 0}%</span>
                          </div>
                        </td>
                        <td><span className={`badge ${t.repeat ? 'success' : 'muted'}`}>{t.repeat ? 'Enabled' : 'Disabled'}</span></td>
                      </tr>
                    );
                  })}
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
