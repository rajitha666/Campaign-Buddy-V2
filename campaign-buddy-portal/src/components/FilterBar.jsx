import { useId } from 'react';
import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';

export default function FilterBar({ filters, values, onChange, onLoad }) {
  const { designationLabel } = useAuth();
  const uid = useId();
  if (!filters || filters.length === 0) return null;
  return (
    <div className="filter-bar">
      {filters.map((f) => {
        const fieldLabel = applyDesignationLabel(f.label, designationLabel);
        const allLabel = applyDesignationLabel(f.allLabel, designationLabel);
        return (
        <div className="filter-field" key={f.key}>
          <label htmlFor={`${uid}-${f.key}`}>{fieldLabel}</label>
          {f.type === 'searchable-select' ? (
            <SearchableSelect
              id={`${uid}-${f.key}`}
              options={allLabel ? [{ value: '', label: allLabel }, ...(f.options || [])] : (f.options || [])}
              value={values[f.key] ?? ''}
              onChange={(v) => onChange(f.key, v)}
              placeholder={allLabel || `Search ${fieldLabel.toLowerCase()}…`}
            />
          ) : f.type === 'select' ? (
            <select id={`${uid}-${f.key}`} value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
              {allLabel ? <option value="">{allLabel}</option> : null}
              {(f.options || []).map((o) => (
                <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
              ))}
            </select>
          ) : f.type === 'daterange' ? (
            <input
              id={`${uid}-${f.key}`}
              type="text"
              placeholder="From – To"
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <input
              id={`${uid}-${f.key}`}
              type={f.type === 'date' ? 'date' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
        </div>
        );
      })}
      {onLoad ? <button className="btn btn-primary btn-sm" onClick={onLoad}>Refresh</button> : null}
    </div>
  );
}
