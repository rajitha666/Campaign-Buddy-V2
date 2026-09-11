import { useEffect, useMemo, useRef, useState } from 'react';

// Type-to-filter dropdown for a plain {value,label} option list. Used in the
// Drawer wherever a `<select>` list can grow too long to scan (staff, outlets,
// distributor points, …). Filters client-side by substring match on `label`.
export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open ? (
        <div className="searchable-select-menu">
          {filtered.length === 0 ? (
            <div className="searchable-select-empty">No matches</div>
          ) : filtered.map((o) => (
            <div
              key={o.value}
              className={'searchable-select-option' + (String(o.value) === String(value) ? ' is-selected' : '')}
              onMouseDown={() => { onChange(o.value); setOpen(false); setQuery(''); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
