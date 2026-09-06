// Renders GET /campaigns/{id}/tracking/live as pins on a stylised (non-GIS)
// map. Real lat/lng aren't projected onto anything geographic here — swap
// in a real map library (Mapbox/Leaflet) once the backend is live and you
// want accurate positioning; this keeps the prototype's visual language
// (pulsing dot = live promoter, dark dot = outlet) without a maps API key.
export default function LiveMapView({ pings = [] }) {
  if (pings.length === 0) {
    return <div className="map-shell"><div className="empty-state" style={{ paddingTop: 130 }}>No one is checked in right now.</div></div>;
  }
  // Spread pins deterministically across the shell so they don't overlap.
  const positioned = pings.map((p, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    return { ...p, left: 18 + col * 28, top: 22 + row * 30 };
  });
  return (
    <div className="map-shell">
      {positioned.map((p) => (
        <div key={p.userId || p.id} className="map-pin" style={{ left: `${p.left}%`, top: `${p.top}%` }}>
          <div className="pulse" /><div className="dot" />
          <div className="tag">{p.staffName || p.userId} · {p.outletName || p.outletId}</div>
        </div>
      ))}
      <div className="map-legend">
        <div className="item"><div className="sw" style={{ background: 'var(--mango)' }} />Promoter (live)</div>
        <div className="item"><div className="sw" style={{ background: 'var(--ink)' }} />Outlet</div>
      </div>
    </div>
  );
}
