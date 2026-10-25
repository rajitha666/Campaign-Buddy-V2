import { useEffect, useRef, useState } from 'react';
import { salesLookup, salesRecords as salesRecordsApi, salesFields as salesFieldsApi } from '../lib/endpoints';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import { exportFilename } from '../lib/exportFilename';
import { downloadCsv } from '../lib/csv';
import { colomboYmd } from '../lib/colomboDay';

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
// table, a column per product-level field. Sales records are managed per row
// (sales-archive-spec.md): Update saves the row, Archive soft-deletes it out of
// every total/report, Unarchive brings it back.
export default function SalesCorrectionGrid({ campaignId, filterSlot, form, onSaved }) {
  const { push } = useToast();
  const { designationLabel } = useAuth();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [dayValues, setDayValues] = useState({});
  const [productValues, setProductValues] = useState({}); // { activationItemId: { key: value } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Per-row inline feedback ("Saved ✓" / "Archived ✓" / an error message) that
  // clears itself after a few seconds — keyed by activationItemId so it
  // survives the reload that follows archive/unarchive.
  const [rowFeedback, setRowFeedback] = useState({});
  const feedbackTimers = useRef({});

  useEffect(() => {
    const timers = feedbackTimers;
    return () => { Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  function setFeedback(itemId, kind) {
    clearTimeout(feedbackTimers.current[itemId]);
    setRowFeedback((f) => ({ ...f, [itemId]: { kind } }));
    feedbackTimers.current[itemId] = setTimeout(() => {
      setRowFeedback((f) => { const n = { ...f }; delete n[itemId]; return n; });
    }, 4000);
  }

  const dayDefs = meta.dayCustomFields || [];
  const productDefs = (rows && rows[0]?.customFields) || [];

  async function loadSales() {
    setLoading(true); setError(null);
    try {
      const res = await salesLookup.load(campaignId, form);
      const data = res?.data || [];
      setRows(data);
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

  // Pick an outlet (or change the date) and the sales appear — no separate Load click.
  // The button below stays as a manual refresh.
  useEffect(() => {
    if (campaignId && form.outletId) loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, form.outletId, form.date]);

  function setCell(idx, key, val) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: val } : row)));
  }
  function setProductVal(itemId, key, val) {
    setProductValues((pv) => ({ ...pv, [itemId]: { ...pv[itemId], [key]: val } }));
  }

  async function saveRowCustomFields(r) {
    if (!meta.activationId || !(productDefs.length || dayDefs.length)) return;
    await salesFieldsApi.saveValues(campaignId, {
      activationId: meta.activationId,
      date: form.date || colomboYmd(),
      products: { [r.activationItemId]: productValues[r.activationItemId] || {} },
    });
  }

  async function updateRow(idx) {
    const r = rows[idx];
    try {
      if (Number(r.soldToday || 0) > Number(r.openingStock || 0)) {
        push('Sold Qty cannot exceed Initial Qty', 'error');
        setFeedback(r.activationItemId, 'error');
        return;
      }
      if (r.id == null) {
        // no record yet — create it for this product + day; the row is patched
        // in place (no reload, no layout shift) and now has an id
        const created = await salesRecordsApi.create(campaignId, {
          activationItemId: r.activationItemId,
          date: form.date || colomboYmd(),
          openingStock: Number(r.openingStock),
          soldToday: Number(r.soldToday),
        });
        await saveRowCustomFields(r);
        setRows((rs) => rs.map((row, i) => (i === idx ? { ...row, id: created?.data?.id ?? row.id } : row)));
        push('Sales entry saved');
        setFeedback(r.activationItemId, 'ok');
        onSaved?.();
        return;
      }
      await salesRecordsApi.correct(campaignId, r.id, { openingStock: Number(r.openingStock), soldToday: Number(r.soldToday) });
      await saveRowCustomFields(r);
      push('Sales correction saved');
      setFeedback(r.activationItemId, 'ok');
      onSaved?.();
    } catch (e) {
      push(e.message || 'Could not save this row', 'error');
      setFeedback(r.activationItemId, 'error');
    }
  }

  async function archiveRow(idx) {
    const r = rows[idx];
    if (r.id == null) return;
    if (!window.confirm('Archive this sales record? It will be excluded from all totals and reports.')) return;
    try {
      await salesRecordsApi.archive(campaignId, r.id);
      // mute the row in place — no reload, the table never jumps
      setRows((rs) => rs.map((row, i) => (i === idx ? { ...row, archived: true } : row)));
      push('Sales record archived');
      setFeedback(r.activationItemId, 'ok');
      onSaved?.();
    } catch (e) {
      push(e.message || 'Could not archive this row', 'error');
      setFeedback(r.activationItemId, 'error');
    }
  }

  async function unarchiveRow(idx) {
    const r = rows[idx];
    if (!r.archived) return;
    if (!window.confirm('Unarchive this sales record? It will be counted in all totals and reports again.')) return;
    try {
      await salesRecordsApi.restore(campaignId, r.id);
      setRows((rs) => rs.map((row, i) => (i === idx ? { ...row, archived: false } : row)));
      push('Sales record unarchived');
      setFeedback(r.activationItemId, 'ok');
      onSaved?.();
    } catch (e) {
      push(e.message || 'Could not unarchive this row', 'error');
      setFeedback(r.activationItemId, 'error');
    }
  }

  async function saveDayFields() {
    if (!meta.activationId || !dayDefs.length) return;
    try {
      await salesFieldsApi.saveValues(campaignId, {
        activationId: meta.activationId,
        date: form.date || colomboYmd(),
        day: dayValues,
      });
      push('Daily fields saved');
    } catch (e) {
      push(e.message || 'Could not save daily fields', 'error');
    }
  }

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const headers = ['Product', 'Status', 'Unit Price', 'Initial Qty', 'Sold Qty', 'Total Sales',
      ...productDefs.map((d) => d.label),
      ...dayDefs.map((d) => `Day: ${d.label}`)];
    const lines = rows.filter((r) => !r.archived).map((r) => [
      r.itemName, 'Active', r.unitPrice, r.openingStock, r.soldToday,
      Number(r.unitPrice || 0) * Number(r.soldToday || 0),
      ...productDefs.map((d) => productValues[r.activationItemId]?.[d.key] ?? ''),
      ...dayDefs.map((d) => dayValues[d.key] ?? ''),
    ]);
    downloadCsv(exportFilename('Sales Correction', 'csv'), [headers, ...lines]);
  }

  return (
    <div>
      {filterSlot}
      <div className="filter-bar" style={{ marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={loadSales} disabled={!form.outletId} title={form.outletId ? undefined : 'Choose an outlet first'}>Refresh</button>
        {rows && rows.length > 0 ? <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button> : null}
      </div>
      {rows && meta.activationId ? (
        <div className="cell-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {applyDesignationLabel('Promoter', designationLabel)}: <strong>{meta.staffName}</strong> · Activation: <strong>{meta.activationName}</strong>
        </div>
      ) : null}

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
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={saveDayFields}>Save daily fields</button>
              </div>
            </div>
          ) : null}

          <div className="table-card" style={{ marginTop: 12 }}>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th><th>Unit Price</th><th>Initial Qty</th><th>Sold Qty</th><th>Total Sales</th><th></th>
                    {productDefs.map((d) => <th key={d.key}>{d.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || r.activationItemId || i} style={r.archived ? { opacity: 0.55 } : undefined}>
                      <td className="cell-strong">
                        {r.itemName}
                        {/* colored status chip: fixed-size reserved slot — idle
                            (transparent), tinted green ✓ / red ! after an action,
                            fading out a few seconds later. Never shifts layout. */}
                        <span aria-hidden={!rowFeedback[r.activationItemId]}
                          style={{ display: 'inline-block', width: 22, minWidth: 22, height: 20, marginLeft: 6,
                            borderRadius: 6, textAlign: 'center', lineHeight: '20px', fontSize: 12, fontWeight: 700,
                            color: rowFeedback[r.activationItemId]?.kind === 'ok' ? 'var(--success)' : 'var(--alert)',
                            background: rowFeedback[r.activationItemId] ? (rowFeedback[r.activationItemId].kind === 'ok' ? 'var(--success-tint)' : 'var(--alert-tint)') : 'transparent',
                            animation: rowFeedback[r.activationItemId] ? 'chipPop 180ms ease-out' : 'none' }}>
                          {rowFeedback[r.activationItemId] ? (rowFeedback[r.activationItemId].kind === 'ok' ? '✓' : '!') : ''}
                        </span>
                      </td>
                      <td>LKR {Number(r.unitPrice || 0).toLocaleString()}</td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.openingStock} disabled={r.archived} onChange={(e) => setCell(i, 'openingStock', e.target.value)} /></td>
                      <td><input style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 7 }} value={r.soldToday} disabled={r.archived} onChange={(e) => setCell(i, 'soldToday', e.target.value)} /></td>
                      <td>LKR {(Number(r.unitPrice || 0) * Number(r.soldToday || 0)).toLocaleString()}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {/* all three buttons always render; irrelevant ones are
                            visibility-hidden so the cell's width never changes
                            between live / blank / archived states */}
                        <button className="btn btn-primary btn-sm" style={{ visibility: r.archived ? 'hidden' : 'visible' }} onClick={() => updateRow(i)}>Update</button>{' '}
                        <button className="btn btn-ghost-alert btn-sm" style={{ visibility: r.archived || r.id == null ? 'hidden' : 'visible' }} onClick={() => archiveRow(i)}>Archive</button>{' '}
                        <button className="btn btn-secondary btn-sm" style={{ visibility: r.archived ? 'visible' : 'hidden' }} onClick={() => unarchiveRow(i)}>Unarchive</button>
                      </td>
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
              <span className="cell-muted" style={{ fontSize: 12 }}>Update saves the row (a row with no numbers yet gets created); Archive soft-deletes it out of all totals and reports (the promoter can re-enter it). Rows change on the spot — the grid never reloads. Custom fields save per row; day-level fields use "Save daily fields" above.</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
