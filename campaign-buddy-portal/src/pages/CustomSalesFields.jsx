import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { salesFields as salesFieldsApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';

const TYPE_LABELS = { number: 'Number', text: 'Text', boolean: 'Yes / No', select: 'Dropdown' };
const SCOPE_LABELS = { day: 'Whole day', product: 'Each product' };

const EMPTY = { label: '', type: 'number', scope: 'day', options: '', required: 'no', sortOrder: '' };

export default function CustomSalesFields() {
  const { currentCampaignId, isAdmin } = useAuth();
  const { push } = useToast();

  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // row being edited, or null for "add"
  const [form, setForm] = useState(EMPTY);
  const [formErr, setFormErr] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!currentCampaignId) return;
    setLoading(true);
    setError(null);
    salesFieldsApi.list(currentCampaignId, { includeArchived: 1 })
      .then((res) => setRows(res?.data || []))
      .catch((e) => setError(e.message || 'Could not load custom fields.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [currentCampaignId]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormErr(null);
    setModalOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({
      label: row.label,
      type: row.type,
      scope: row.scope,
      options: (row.options || []).join('\n'),
      required: row.required ? 'yes' : 'no',
      sortOrder: String(row.sortOrder ?? ''),
    });
    setFormErr(null);
    setModalOpen(true);
  }

  async function save() {
    setFormErr(null);
    const label = form.label.trim();
    if (!label) { setFormErr('Give the field a label.'); return; }
    const options = form.options.split('\n').map((s) => s.trim()).filter(Boolean);
    if (form.type === 'select' && options.length < 2) {
      setFormErr('A dropdown needs at least two options, one per line.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const body = {
          label,
          required: form.required === 'yes',
          ...(form.type === 'select' ? { options } : {}),
          ...(form.sortOrder !== '' ? { sortOrder: Number(form.sortOrder) } : {}),
        };
        await salesFieldsApi.update(currentCampaignId, editing.id, body);
        push('Field updated');
      } else {
        const body = {
          label,
          type: form.type,
          scope: form.scope,
          required: form.required === 'yes',
          ...(form.type === 'select' ? { options } : {}),
          ...(form.sortOrder !== '' ? { sortOrder: Number(form.sortOrder) } : {}),
        };
        await salesFieldsApi.create(currentCampaignId, body);
        push('Field added');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setFormErr(e.message || 'Could not save the field.');
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(row, archived) {
    try {
      await salesFieldsApi.update(currentCampaignId, row.id, { archived });
      push(archived ? 'Field archived' : 'Field restored');
      load();
    } catch (e) {
      push(e.message || 'Could not update the field', 'error');
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.label}"? This can't be undone.`)) return;
    try {
      await salesFieldsApi.remove(currentCampaignId, row.id);
      push('Field deleted');
      load();
    } catch (e) {
      push(e.message || 'Could not delete — archive it instead if it has recorded values.', 'error');
    }
  }

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  const visible = (rows || []).filter((r) => showArchived || !r.archived);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Custom Sales Fields</h1>
          <p className="page-sub">Extra data promoters record on the daily sales update, for this campaign.</p>
        </div>
        {isAdmin ? <button className="btn btn-primary" onClick={openAdd}>+ Add Field</button>
          : <div className="locked-note">🔒 Read-only in this view</div>}
      </div>

      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="table-card">
          <div className="table-toolbar">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th><th>Applies to</th><th>Type</th><th>Options</th>
                  <th>Required</th><th>Order</th><th>Status</th>{isAdmin ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="cell-muted">No custom fields yet.</td></tr>
                ) : visible.map((r) => (
                  <tr key={r.id} style={r.archived ? { opacity: 0.55 } : undefined}>
                    <td className="cell-strong">{r.label}<div className="rank-meta">{r.key}</div></td>
                    <td>{SCOPE_LABELS[r.scope]}</td>
                    <td>{TYPE_LABELS[r.type]}</td>
                    <td>{r.type === 'select' ? (r.options || []).join(', ') : '—'}</td>
                    <td>{r.required ? 'Yes' : 'No'}</td>
                    <td>{r.sortOrder}</td>
                    <td>{r.archived ? 'Archived' : 'Active'}</td>
                    {isAdmin ? (
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                          {r.archived
                            ? <button className="btn btn-secondary btn-sm" onClick={() => setArchived(r, false)}>Restore</button>
                            : <button className="btn btn-secondary btn-sm" onClick={() => setArchived(r, true)}>Archive</button>}
                          <button className="btn btn-ghost-alert btn-sm" onClick={() => remove(r)}>Delete</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Field' : 'Add Field'}
        subtitle="Custom Sales Fields"
        onClose={() => setModalOpen(false)}
      >
        {formErr ? <div className="error-state" style={{ marginBottom: 14 }}>{formErr}</div> : null}

        <div className="form-row">
          <label>Label <span className="req">*</span></label>
          <input type="text" value={form.label} placeholder="e.g. Competitor promo running?"
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </div>

        <div className="form-row">
          <label>Applies to</label>
          <div className="radio-row">
            {['day', 'product'].map((v) => (
              <span key={v}
                className={`chip-opt ${form.scope === v ? 'selected' : ''}`}
                style={editing ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                onClick={() => !editing && setForm((f) => ({ ...f, scope: v }))}>
                {SCOPE_LABELS[v]}
              </span>
            ))}
          </div>
          {editing ? <div className="rank-meta">Can’t change after creation.</div> : null}
        </div>

        <div className="form-row">
          <label>Type</label>
          <select value={form.type} disabled={!!editing}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {editing ? <div className="rank-meta">Can’t change after creation.</div> : null}
        </div>

        {form.type === 'select' ? (
          <div className="form-row">
            <label>Dropdown options <span className="req">*</span></label>
            <textarea rows={4} placeholder={'One per line\nSunny\nCloudy\nRain'}
              value={form.options}
              onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
          </div>
        ) : null}

        <div className="form-row">
          <label>Required</label>
          <div className="radio-row">
            {[['no', 'Optional'], ['yes', 'Required']].map(([v, l]) => (
              <span key={v} className={`chip-opt ${form.required === v ? 'selected' : ''}`}
                onClick={() => setForm((f) => ({ ...f, required: v }))}>{l}</span>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>Sort order</label>
          <input type="number" value={form.sortOrder} placeholder="auto"
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add field'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
