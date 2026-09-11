import { useEffect, useState } from 'react';
import { ICONS } from './Icons';
import SearchableSelect from './SearchableSelect';

// Generic Add/Edit form drawer. `fields` config (see config/resources.js) drives
// what renders; `initialValues` pre-fills for edit mode. onSubmit receives the
// flat values object and should return a Promise (rejected -> shows error).
export default function Drawer({
  open, title, subtitle, fields = [], initialValues = {}, saveLabel = 'Save',
  onClose, onSubmit,
}) {
  const [values, setValues] = useState({});
  const [builderRows, setBuilderRows] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (open) {
      const defaults = {};
      fields.forEach((f) => {
        if (f.type === 'section') return;
        if (f.type === 'radio') defaults[f.key] = initialValues[f.key] ?? f.options?.[0]?.value ?? f.options?.[0];
        else defaults[f.key] = initialValues[f.key] ?? f.defaultValue ?? '';
      });
      setValues(defaults);
      const builders = {};
      fields.filter((f) => f.type === 'builder').forEach((f) => { builders[f.key] = initialValues[f.key] || f.preset || []; });
      setBuilderRows(builders);
      setError(null);
      setFieldErrors({});
    }
  }, [open, fields, initialValues]);

  if (!open) return null;

  function set(key, val) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function validate() {
    const errs = {};
    fields.forEach((f) => {
      if (f.type === 'section') return;
      if (f.required && !values[f.key] && f.type !== 'builder') errs[f.key] = 'Required';
      else if (f.validate && values[f.key]) {
        const msg = f.validate(values[f.key]);
        if (msg) errs[f.key] = msg;
      }
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...values, ...builderRows });
      onClose();
    } catch (e) {
      if (e?.field) setFieldErrors((f) => ({ ...f, [e.field]: e.message }));
      else setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer open">
        <div className="drawer-head">
          <div>
            <div className="drawer-title h-display">{title}</div>
            <div className="drawer-sub">{subtitle}</div>
          </div>
          <div className="close-btn" onClick={onClose}>{ICONS.close}</div>
        </div>
        <div className="drawer-body">
          {error ? <div className="error-state" style={{ marginBottom: 16 }}>{error}</div> : null}
          {fields.map((f, i) => (
            <Field
              key={f.key || `section-${i}`}
              field={f}
              value={values[f.key]}
              onChange={(v) => set(f.key, v)}
              error={fieldErrors[f.key]}
              builderRows={builderRows[f.key]}
              onBuilderChange={(rows) => setBuilderRows((b) => ({ ...b, [f.key]: rows }))}
              preview={f.previewKey ? initialValues[f.previewKey] : undefined}
            />
          ))}
        </div>
        <div className="drawer-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ field: f, value, onChange, error, builderRows, onBuilderChange, preview }) {
  const reqMark = f.required ? <span className="req">*</span> : null;

  if (f.type === 'section') {
    return <div className="section-divider">{f.label}</div>;
  }

  if (f.type === 'date') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }

  if (f.type === 'creatable') {
    const knownValues = (f.options || []).map((o) => o.value ?? o);
    const initialOther = value != null && value !== '' && !knownValues.includes(value);
    const [otherMode, setOtherMode] = useState(initialOther);
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <select
          value={otherMode ? '__other__' : (value || '')}
          onChange={(e) => {
            if (e.target.value === '__other__') { setOtherMode(true); onChange(''); }
            else { setOtherMode(false); onChange(e.target.value); }
          }}
        >
          <option value="" disabled>Select…</option>
          {(f.options || []).map((o) => {
            const v = o.value ?? o; const l = o.label ?? o;
            return <option key={v} value={v}>{l}</option>;
          })}
          <option value="__other__">Other (type below)</option>
        </select>
        {otherMode ? (
          <input
            type="text"
            style={{ marginTop: 8 }}
            placeholder="Type custom designation"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : null}
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }

  if (f.type === 'text') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <input type="text" placeholder={f.placeholder || ''} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }
  if (f.type === 'textarea') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <textarea placeholder={f.placeholder || ''} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {(f.options || []).map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
          ))}
        </select>
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }
  if (f.type === 'searchable-select') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <SearchableSelect options={f.options || []} value={value} onChange={onChange} placeholder={f.placeholder || 'Select…'} />
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }
  if (f.type === 'radio') {
    return (
      <div className="form-row">
        <label>{f.label}</label>
        <div className="radio-row">
          {(f.options || []).map((o) => {
            const v = o.value ?? o;
            const l = o.label ?? o;
            return (
              <span key={v} className={`chip-opt ${value === v ? 'selected' : ''}`} onClick={() => onChange(v)}>{l}</span>
            );
          })}
        </div>
      </div>
    );
  }
  if (f.type === 'daterange') {
    const [from, to] = Array.isArray(value) ? value : ['', ''];
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        <div className="form-two">
          <input type="date" value={from} onChange={(e) => onChange([e.target.value, to])} />
          <input type="date" value={to} onChange={(e) => onChange([from, e.target.value])} />
        </div>
        {error ? <div className="form-error">{error}</div> : null}
      </div>
    );
  }
  if (f.type === 'upload') {
    return (
      <div className="form-row">
        <label>{f.label} {reqMark}</label>
        {preview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <img src={preview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', background: '#f1f2f6' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="cell-muted" style={{ fontSize: 12 }}>Current image — choose a file to replace it</span>
          </div>
        ) : null}
        <input type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        {value instanceof File ? <div className="cell-muted" style={{ fontSize: 12, marginTop: 6 }}>{value.name}</div> : null}
      </div>
    );
  }
  if (f.type === 'geocode') {
    const { lat = '', lng = '' } = value || {};
    return (
      <div className="form-row">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
          onClick={() => onChange({ lat: '6.8845', lng: '79.8887' })}
        >
          📍 Get Latitude and Longitude values
        </button>
        <div className="form-two">
          <div><label>Latitude <span className="req">*</span></label><input type="text" value={lat} onChange={(e) => onChange({ lat: e.target.value, lng })} /></div>
          <div><label>Longitude <span className="req">*</span></label><input type="text" value={lng} onChange={(e) => onChange({ lat, lng: e.target.value })} /></div>
        </div>
      </div>
    );
  }
  if (f.type === 'builder') {
    const rows = builderRows || [];
    return (
      <div className="form-row">
        <label>{f.label}</label>
        <div className="builder-add-row">
          <select id={`builder-opt-${f.key}`}>
            {(f.options || []).map((o) => <option key={o}>{o}</option>)}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const sel = document.getElementById(`builder-opt-${f.key}`);
              if (sel?.value) onBuilderChange([...rows, sel.value]);
            }}
          >
            {f.addLabel || 'Add'}
          </button>
        </div>
        <div className="builder-table">
          {rows.map((r, i) => (
            <div className="brow" key={`${r}-${i}`}>
              <span>{r}</span>
              <span className="icon-btn delete" style={{ width: 24, height: 24 }} onClick={() => onBuilderChange(rows.filter((_, idx) => idx !== i))}>✕</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
