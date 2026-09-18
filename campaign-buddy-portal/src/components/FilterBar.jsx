import SearchableSelect from './SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';

export default function FilterBar({ filters, values, onChange, onLoad }) {
  const { designationLabel } = useAuth();
  if (!filters || filters.length === 0) return null;
  return (
    <div className="filter-bar">
      {filters.map((f) => {
        const fieldLabel = applyDesignationLabel(f.label, designationLabel);
        const allLabel = applyDesignationLabel(f.allLabel, designationLabel);
        return (
        <div className="filter-field" key={f.key}>
          <label>{fieldLabel}</label>
          {f.type === 'searchable-select' ? (
            <SearchableSelect
              options={allLabel ? [{ value: '', label: allLabel }, ...(f.options || [])] : (f.options || [])}
              value={values[f.key] ?? ''}
              onChange={(v) => onChange(f.key, v)}
              placeholder={allLabel || `Search ${fieldLabel.toLowerCase()}…`}
            />
          ) : f.type === 'select' ? (
            <select value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
              {allLabel ? <option value="">{allLabel}</option> : null}
              {(f.options || []).map((o) => (
                <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
              ))}
            </select>
          ) : f.type === 'daterange' ? (
            <input
              type="text"
              placeholder="From – To"
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <input
              type={f.type === 'date' ? 'date' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
        </div>
        );
      })}
      {onLoad ? <button className="btn btn-primary btn-sm" onClick={onLoad}>Load</button> : null}
    </div>
  );
}
