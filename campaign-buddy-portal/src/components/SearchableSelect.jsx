import { useEffect, useMemo, useRef, useState } from 'react';
import { ICONS } from './Icons';
import { sortOptionsWithAllFirst } from '../lib/sortOptions';

// Type-to-filter dropdown for a plain {value,label} option list. Used in the
// Drawer wherever a `<select>` list can grow too long to scan (staff, outlets,
// distributor points, …). Filters client-side by substring match on `label`.
//
// Interaction hardening (issue #30): clicking the control re-opens the menu
// even when the input never lost focus (onFocus alone doesn't re-fire, so the
// menu previously became unreachable after any outside click that kept focus),
// and ArrowUp/ArrowDown/Enter support a keyboard path — typing to filter used
// to dead-end because selection required a mouse click. A visible caret makes
// it look selectable (issue #34 class reports).
export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));
  // Alphabetical everywhere (#67) — sorted once here rather than at every
  // options source, so every searchable-select in the portal gets it for free.
  const sortedOptions = useMemo(() => sortOptionsWithAllFirst(options), [options]);

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
    if (!q) return sortedOptions;
    return sortedOptions.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [sortedOptions, query]);

  useEffect(() => { setHighlight(0); }, [query, open]);

  function openMenu() {
    setOpen(true);
    setQuery('');
    setHighlight(0);
  }
  function choose(o) {
    onChange(o.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && open) {
      const o = filtered[highlight] ?? filtered[0];
      if (o) { e.preventDefault(); choose(o); }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        // onFocus opens it the first time; onClick also RE-opens when the input
        // was never blurred (focus events don't re-fire then — issue #30).
        onFocus={() => { setOpen(true); setQuery(''); setHighlight(0); }}
        onClick={() => { if (!open) { setOpen(true); setQuery(''); setHighlight(0); } }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <div className="searchable-select-menu">
          {filtered.length === 0 ? (
            <div className="searchable-select-empty">No matches</div>
          ) : filtered.map((o, i) => (
            <div
              key={o.value}
              className={'searchable-select-option' + (String(o.value) === String(value) ? ' is-selected' : '') + (i === highlight ? ' is-highlighted' : '')}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={() => choose(o)}
            >
              {o.label}
            </div>
          ))}
        </div>
      ) : null}
      <div className="searchable-select-caret">{ICONS.chevron}</div>
    </div>
  );
}
