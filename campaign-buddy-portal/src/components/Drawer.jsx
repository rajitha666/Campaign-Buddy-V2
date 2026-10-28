import { useEffect, useRef, useState } from 'react';
import { ICONS } from './Icons';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';
import { groupFields, sectionSummary, sectionStartsOpen, fieldError, groupsWithErrors } from '../lib/formSections';

// Stable identities for optional props: literal defaults ({}, []) inside the
// destructure would be re-created on every render and re-trigger the reset
// effect below (infinite loop that wipes whatever the user is typing).
const EMPTY_FIELDS = [];
const EMPTY_INIT = {};

// Generic Add/Edit form drawer. `fields` config (see config/resources.js) drives
// what renders; `initialValues` pre-fills for edit mode. onSubmit receives the
// flat values object and should return a Promise (rejected -> shows error).
// A field can opt into `resettable` (used for password): in edit mode it renders
// collapsed behind a "Reset Password" reveal — until revealed, its value is
// excluded from the submit payload, so nothing is sent that would overwrite the
// stored secret. Once revealed, blank on save also means "keep" (backend accepts
// "" as keep on updates).
export default function Drawer({
  open, title, subtitle, fields = EMPTY_FIELDS, initialValues = EMPTY_INIT, saveLabel = 'Save',
  mode = 'add',
  onClose, onSubmit,
}) {
  const [values, setValues] = useState({});
  const [builderRows, setBuilderRows] = useState({});
  const [revealed, setRevealed] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const edited = useRef({}); // keys the user typed into, so defaultFrom stops following its source
  const bodyRef = useRef(null);
  const groups = groupFields(fields);

  useEffect(() => {
    if (open) {
      const defaults = {};
      fields.forEach((f) => {
        if (f.type === 'section') return;
        if (f.type === 'radio') defaults[f.key] = initialValues[f.key] ?? f.options?.[0]?.value ?? f.options?.[0];
        else defaults[f.key] = initialValues[f.key] ?? f.defaultValue ?? '';
      });
      setValues(defaults);
      edited.current = {};
      const merged = { ...defaults, ...initialValues };
      const startOpen = {};
      groupFields(fields).forEach((g, i) => { startOpen[i] = sectionStartsOpen(g, merged, mode); });
      setOpenGroups(startOpen);
      const builders = {};
      fields.filter((f) => f.type === 'builder').forEach((f) => { builders[f.key] = initialValues[f.key] || f.preset || []; });
      setBuilderRows(builders);
      setRevealed({});
      setError(null);
      setFieldErrors({});
    }
  }, [open, fields, initialValues, mode]);

  if (!open) return null;

  function set(key, val) {
    edited.current[key] = true;
    setValues((v) => {
      const next = { ...v, [key]: val };
      // Fields with `defaultFrom` mirror their source (e.g. Display Name from
      // Full Name) on Add until the user edits them directly.
      fields.forEach((f) => {
        if (f.defaultFrom === key && mode !== 'edit' && !edited.current[f.key]) next[f.key] = val;
      });
      return next;
    });
  }

  const isHidden = (f) => !!(f.resettable && mode === 'edit' && !revealed[f.key]);

  function validateOne(f) {
    if (f.type === 'section') return;
    const msg = fieldError(f, values[f.key], { hidden: isHidden(f) });
    setFieldErrors((e) => {
      if (!msg && !e[f.key]) return e;
      const next = { ...e };
      if (msg) next[f.key] = msg; else delete next[f.key];
      return next;
    });
  }

  function focusFirstError() {
    // After the sections re-render open, move focus to the first invalid control.
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector('[aria-invalid="true"]');
      const target = el || bodyRef.current?.querySelector('.form-error');
      if (target) { target.scrollIntoView?.({ block: 'center' }); target.focus?.(); }
    });
  }

  function validate() {
    const errs = {};
    fields.forEach((f) => {
      const msg = fieldError(f, values[f.key], { hidden: isHidden(f) });
      if (msg) errs[f.key] = msg;
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      const open = groupsWithErrors(groups, errs);
      setOpenGroups((o) => { const n = { ...o }; open.forEach((i) => { n[i] = true; }); return n; });
      focusFirstError();
    }
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const removed = {};
      // Hidden resettable fields (e.g. password on edit) must not reach the API.
      fields.forEach((f) => {
        if (f.resettable && mode === 'edit' && !revealed[f.key]) removed[f.key] = true;
      });
      const payload = { ...values, ...builderRows };
      Object.keys(removed).forEach((k) => delete payload[k]);
      await onSubmit(payload);
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
        <div className="drawer-body" ref={bodyRef}>
          {error ? <div className="error-state" style={{ marginBottom: 16 }}>{error}</div> : null}
          {groups.map((g, gi) => {
            const isOpen = !g.collapsible || !!openGroups[gi];
            const body = g.fields.map((f) => (
              <div key={f.key} data-field={f.key} onBlur={() => validateOne(f)}>
                <Field
                  field={f}
                  value={values[f.key]}
                  onChange={(v) => set(f.key, v)}
                  error={fieldErrors[f.key]}
                  builderRows={builderRows[f.key]}
                  onBuilderChange={(rows) => setBuilderRows((b) => ({ ...b, [f.key]: rows }))}
                  preview={f.previewKey ? initialValues[f.previewKey] : undefined}
                  edit={mode === 'edit'}
                  revealed={!!revealed[f.key]}
                  onReveal={() => setRevealed((r) => ({ ...r, [f.key]: true }))}
                />
              </div>
            ));
            if (!g.collapsible) {
              return (
                <div key={`g-${gi}`}>
                  {g.label ? <div className="section-divider">{g.label}</div> : null}
                  {body}
                </div>
              );
            }
            const hasError = g.fields.some((f) => fieldErrors[f.key]);
            return (
              <div key={`g-${gi}`} className={`form-section ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="form-section-head"
                  aria-expanded={isOpen}
                  aria-controls={`form-section-${gi}`}
                  onClick={() => setOpenGroups((o) => ({ ...o, [gi]: !isOpen }))}
                >
                  <span className="form-section-title">{g.label}</span>
                  <span className={`form-section-sum ${hasError ? 'err' : ''}`}>{hasError ? 'Needs attention' : sectionSummary(g, values)}</span>
                  <span className="form-section-chev" aria-hidden="true">{ICONS.chevron || '›'}</span>
                </button>
                <div id={`form-section-${gi}`} className="form-section-body" hidden={!isOpen}>{body}</div>
              </div>
            );
          })}
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

function Field({ field: rawField, value, onChange, error, builderRows, onBuilderChange, preview, edit, revealed, onReveal }) {
  const { designationLabel } = useAuth();
  // Substituted once here (client doc F) — every f.label/f.hint/f.options
  // reference below picks it up automatically, no need to touch each call site.
  const f = {
    ...rawField,
    label: applyDesignationLabel(rawField.label, designationLabel),
    hint: applyDesignationLabel(rawField.hint, designationLabel),
    options: (rawField.options || []).map((o) => (typeof o === 'string'
      ? applyDesignationLabel(o, designationLabel)
      : { ...o, label: applyDesignationLabel(o.label, designationLabel) })),
  };
  const reqMark = f.required ? <span className="req">*</span> : null;
  // Label/control/error wiring: the label targets the control, an invalid
  // control points at its message (announced via role="alert").
  const fid = `fld-${f.key}`;
  const eid = `err-${f.key}`;
  const ctl = { id: fid, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? eid : undefined };
  const errEl = error ? <div className="form-error" id={eid} role="alert">{error}</div> : null;

  if (f.type === 'section') {
    return <div className="section-divider">{f.label}</div>;
  }

  // Edit-mode collapse for secrets (password): hidden behind a reveal button so
  // editing unrelated fields never looks like it demands a password re-entry.
  // In add mode resettable fields render like any other required field.
  if (f.resettable && edit && !revealed) {
    return (
      <div className="form-row">
        <div className="form-two">
          <label>{f.label}</label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReveal}>Reset Password</button>
        </div>
        <div className="cell-muted" style={{ fontSize: 12 }}>Password saved in the app — unchanged until reset.</div>
      </div>
    );
  }

  if (f.type === 'date') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <input type="date" {...ctl} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {errEl}
      </div>
    );
  }

  if (f.type === 'creatable') {
    const knownValues = (f.options || []).map((o) => o.value ?? o);
    const initialOther = value != null && value !== '' && !knownValues.includes(value);
    const [otherMode, setOtherMode] = useState(initialOther);
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <select
          {...ctl}
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
        {errEl}
      </div>
    );
  }

  if (f.type === 'text' || f.type === 'tel' || f.type === 'number') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <input
          {...ctl}
          type={f.type}
          pattern={f.pattern}
          inputMode={f.type === 'tel' ? 'tel' : 'numeric'}
          step={f.step || 'any'}
          placeholder={f.placeholder || ''}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        {errEl}
      </div>
    );
  }
  if (f.type === 'time') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <input type="time" {...ctl} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {f.hint ? <div className="cell-muted" style={{ marginTop: 4, fontSize: 12 }}>{f.hint}</div> : null}
        {errEl}
      </div>
    );
  }
  if (f.type === 'textarea') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <textarea {...ctl} placeholder={f.placeholder || ''} value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {errEl}
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <select {...ctl} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {(f.options || []).map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
          ))}
        </select>
        {errEl}
      </div>
    );
  }
  if (f.type === 'searchable-select') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <SearchableSelect options={f.options || []} value={value} onChange={onChange} placeholder={f.placeholder || 'Select…'} />
        {errEl}
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
        <label htmlFor={fid}>{f.label} {reqMark}</label>
        <div className="form-two">
          <input type="date" value={from} onChange={(e) => onChange([e.target.value, to])} />
          <input type="date" value={to} onChange={(e) => onChange([from, e.target.value])} />
        </div>
        {errEl}
      </div>
    );
  }
  if (f.type === 'multi-checkbox') {
    const selected = Array.isArray(value) ? value : [];
    const [filter, setFilter] = useState('');
    const options = f.options || [];
    const visible = filter
      ? options.filter((o) => (o.label ?? o).toLowerCase().includes(filter.toLowerCase()))
      : options;
    function toggle(v) {
      onChange(selected.includes(v) ? selected.filter((id) => id !== v) : [...selected, v]);
    }
    return (
      <div className="form-row">
        <label>{f.label} {reqMark} <span className="cell-muted" style={{ fontWeight: 400 }}>({selected.length} selected)</span></label>
        <input type="text" placeholder={f.filterPlaceholder || 'Search…'} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
        <div className="multi-checkbox-list" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border, #e4e6ec)', borderRadius: 8, padding: 8 }}>
          {visible.length === 0 ? <div className="cell-muted" style={{ padding: 4 }}>No options.</div> : visible.map((o) => {
            const v = o.value ?? o; const l = o.label ?? o;
            return (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
                <span>{l}</span>
              </label>
            );
          })}
        </div>
        {errEl}
      </div>
    );
  }
  if (f.type === 'upload') {
    return (
      <div className="form-row">
        <label htmlFor={fid}>{f.label} {reqMark}</label>
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
          <div><label>Latitude <span className="req">*</span></label><input type="number" step="any" value={lat} onChange={(e) => onChange({ lat: e.target.value, lng })} /></div>
          <div><label>Longitude <span className="req">*</span></label><input type="number" step="any" value={lng} onChange={(e) => onChange({ lat, lng: e.target.value })} /></div>
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
