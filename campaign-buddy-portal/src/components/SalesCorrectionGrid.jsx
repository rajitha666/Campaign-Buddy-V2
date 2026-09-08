import { useState } from 'react';
import { salesLookup, salesRecords as salesRecordsApi, salesFields as salesFieldsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// One editable cell for a custom field value, driven by the field definition.
function CustomFieldCell({ def, value, onChange }) {
  if (def.type === 'boolean') {
    return (
      <select value={value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')}
        style={{ padding: '5px 6px', border: '1px solid var(--line)', borderRadius: 7 }}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (def.type === 'select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        style={{ padding: '5px 6px', border: '1px solid var(--line)', borderRadius: 7 }}>
        <option value="">—</option>
        {(def.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type={def.type === 'number' ? 'number' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: def.type === 'number' ? 80 : 130, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }}
    />
  );
}

// The "Update Sales" load + correction grid, shared by SalesPage and UpdateSales.
// Adds the campaign's custom sales fields (#13): day-level inputs above the
// table, a column per product-level field, saved alongside stock corrections.
export default function SalesCorrectionGrid({ campaignId, filterSlot, form, onSaved }) {
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [dayValues, setDayValues] = useState({});
  const [productValues, setProductValues] = useState({}); // { activationItemId: { key: value } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const dayDefs = meta.dayCustomFields || [];
  const productDefs = (rows && rows[0]?.customFields) || [];

  async function loadSales() {
    setLoading(true); setError(null);
    try {
      const res = await salesLookup.load(campaignId, form);
      const data = res?.data || [];
      setRows(data.map((r) => ({ ...r, selected: false })));
      setMeta(res?.meta || {});

      const dv = {};
      (res?.meta?.dayCustomFields || []).forEach((f) => { dv[f.key] = f.value ?? ''; });
      setDayValues(dv);

      const pv = {};
      data.forEach((r) => {
        pv[r.activationItemId] = {};
        (r.customFields || []).forEach((f) => { pv[r.activationItemId][f.key] = f.value ?? ''; });
      });
      setProductValues(pv);
    } catch (e) {
      setError(e.message || 'Could not load sales for this selection.');
    } finally {
      setLoading(false);
    }
  }

  function setCell(idx, key, val) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  }
  function setProductVal(itemId, key, val) {
    setProductValues((pv) => ({ ...pv, [itemId]: { ...pv[itemId], [key]: val } }));
  }

  async function save() {
    try {
      const selected = (rows || []).filter((r) => r.selected);
      await Promise.all(selected.map((r) =>
        salesRecordsApi.correct(campaignId, r.id, { openingStock: Number(r.openingStock), soldToday: Number(r.soldToday) })
      ));

      if (meta.activationId && (dayDefs.length || productDefs.length)) {
        const products = {};
        (rows || []).forEach((r) => { products[r.activationItemId] = productValues[r.activationItemId] || {}; });
        await salesFieldsApi.saveValues(campaignId, {
          activationId: meta.activationId,
          date: form.date || todayISO(),
          day: dayValues,
          products,
        });
      }
      push('Sales corrections saved');
      onSaved?.();
    } catch (e) {
      push(e.message || 'Could not save corrections', 'error');
    }
  }

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const headers = ['Product', 'Unit Price', 'Initial Qty', 'Sold Qty',
      ...productDefs.map((d) => d.label),
      ...dayDefs.map((d) => `Day: ${d.label}`)];
    const lines = rows.map((r) => [
      r.itemName, r.unitPrice, r.openingStock, r.soldToday,
      ...productDefs.map((d) => productValues[r.activationItemId]?.[d.key] ?? ''),
      ...dayDefs.map((d) => dayValues[d.key] ?? ''),
    ].map((v) => JSON.stringify(String(v ?? ''))).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sales-${form.date || todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {filterSlot}
      <div className="filter-bar" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={loadSales}>Load sales</button>
        {rows && rows.length > 0 ? <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button> : null}
      </div>

      {loading ? <Loader /> : error ? <ErrorState message={error} /> : rows ? (
        <>
          {dayDefs.length > 0 ? (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-title">Daily fields</div>
              <div className="panel-sub">Recorded once for this promoter / outlet / day.</div>
              <div className="form-two" style={{ marginTop: 10 }}>
                {dayDefs.map((d) => (
                  <div key={d.key} className="form-row">
                    <label>{d.label}{d.required ? <span className="req"> *</span> : null}</label>
                    <CustomFieldCell def={d} value={dayValues[d.key]}
                      onChange={(v) => setDayValues((dv) => ({ ...dv, [d.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="table-card" style={{ marginTop: 12 }}>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th><th>Product</th><th>Unit Price</th><th>Initial Qty</th><th>Sold Qty</th>
                    {productDefs.map((d) => <th key={d.key}>{d.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || r.activationItemId || i}>
                      <td><input type="checkbox" checked={!!r.selected} onChange={(e) => setCell(i, 'selected', e.target.checked)} /></td>
                      <td className="cell-strong">{r.itemName}</td>
                      <td>LKR {Number(r.unitPrice || 0).toLocaleString()}</td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.openingStock} onChange={(e) => setCell(i, 'openingStock', e.target.value)} /></td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.soldToday} onChange={(e) => setCell(i, 'soldToday', e.target.value)} /></td>
                      {productDefs.map((d) => (
                        <td key={d.key}>
                          <CustomFieldCell def={d} value={productValues[r.activationItemId]?.[d.key]}
                            onChange={(v) => setProductVal(r.activationItemId, d.key, v)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span className="cell-muted" style={{ fontSize: 12 }}>Tick the products whose stock you changed. Custom fields save for every row.</span>
              <button className="btn btn-primary btn-sm" onClick={save}>Save corrections</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
