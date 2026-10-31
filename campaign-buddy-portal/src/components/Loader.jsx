// Placeholder shown while a page's first data load is in flight. Skeleton rows
// (shimmer disabled for prefers-reduced-motion) feel faster and steadier than a
// bare "Loading…" line; the label stays available to screen readers.
export default function Loader({ label = 'Loading…', rows = 5 }) {
  return (
    <div className="skeleton-block" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} aria-hidden="true">
          <span className="skeleton-bar" style={{ width: `${28 + ((i * 17) % 30)}%` }} />
          <span className="skeleton-bar" style={{ width: `${14 + ((i * 11) % 18)}%` }} />
          <span className="skeleton-bar" style={{ width: `${10 + ((i * 7) % 14)}%` }} />
        </div>
      ))}
    </div>
  );
}
