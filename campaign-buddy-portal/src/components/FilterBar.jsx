export default function FilterBar({ filters, values, onChange, onLoad }) {
  if (!filters || filters.length === 0) return null;
  return (
    <div className="filter-bar">
      {filters.map((f) => (
        <div className="filter-field" key={f.key}>
          <label>{f.label}</label>
          {f.type === 'select' ? (
            <select value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
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
      ))}
      {onLoad ? <button className="btn btn-primary btn-sm" onClick={onLoad}>Load</button> : null}
    </div>
  );
}
