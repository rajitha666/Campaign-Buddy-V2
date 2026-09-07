import { useEffect, useMemo, useRef, useState } from 'react';

// Plots outlets + live sales-staff positions on their real lat/lng, projected
// (equirectangular, longitude scaled by cos(meanLat)) into the panel's own
// pixel box — no map tiles / maps API, but relative positions are geographically
// accurate. Swap in Leaflet/Mapbox later if a basemap is wanted.
const PAD = 46;

export default function CampaignMap({ outlets = [], staff = [], height = 380 }) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 900, h: height });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth || 900, h: el.clientHeight || height });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const model = useMemo(() => buildModel(outlets, staff, box), [outlets, staff, box]);

  return (
    <div className="map-shell map-shell--geo" style={{ height }} ref={wrapRef}>
      {!model ? (
        <div className="empty-state" style={{ paddingTop: height / 2 - 30 }}>
          No outlet locations for this campaign yet.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${box.w} ${box.h}`} width={box.w} height={box.h} className="geo-map">
            <defs>
              <pattern id="geo-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                <path d="M46 0H0V46" fill="none" stroke="rgba(18,36,31,0.08)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={box.w} height={box.h} fill="url(#geo-grid)" />

            {model.outletPts.map((o) => (
              <g key={`o-${o.id}`} transform={`translate(${o.x} ${o.y})`}
                 onMouseEnter={() => setHover({ kind: 'outlet', name: o.name, sub: o.address })}
                 onMouseLeave={() => setHover(null)}>
                {o.r > 0 ? <circle r={o.r} className="geo-geofence" /> : null}
                <circle r="7" className="geo-outlet" />
              </g>
            ))}

            {model.staffPts.map((s, i) => (
              <g key={`s-${i}`} transform={`translate(${s.x} ${s.y})`}
                 onMouseEnter={() => setHover({ kind: 'staff', name: s.staffName, sub: s.outletName, approx: s.approx })}
                 onMouseLeave={() => setHover(null)}>
                <circle r="14" className="geo-staff-pulse" />
                <circle r="6.5" className="geo-staff" />
              </g>
            ))}
          </svg>

          {hover ? (
            <div className={`geo-tip ${hover.kind}`}>
              <b>{hover.name}</b>
              {hover.sub ? <span>{hover.sub}</span> : null}
              {hover.approx ? <span className="geo-tip-note">approx. — last GPS unavailable</span> : null}
            </div>
          ) : null}

          <div className="map-legend">
            <div className="item"><span className="sw sw-staff" />Sales staff live ({model.staffPts.length})</div>
            <div className="item"><span className="sw sw-outlet" />Outlet ({model.outletPts.length})</div>
          </div>
        </>
      )}
    </div>
  );
}

function buildModel(outlets, staff, box) {
  const cleanOutlets = outlets.filter((o) => isNum(o.latitude) && isNum(o.longitude));

  // Resolve a position for every checked-in staffer: real last ping if we have
  // one, else the outlet they're at (jittered so co-located staff don't stack).
  const outletByName = new Map(cleanOutlets.map((o) => [o.name, o]));
  const resolvedStaff = staff.map((s, i) => {
    const pos = s.lastPosition;
    if (pos && isNum(pos.latitude) && isNum(pos.longitude)) {
      return { ...s, latitude: pos.latitude, longitude: pos.longitude, approx: false };
    }
    const o = outletByName.get(s.outletName);
    if (o) {
      const a = (i * 2.399963) % (Math.PI * 2);
      return { ...s, latitude: o.latitude + Math.sin(a) * 0.0006, longitude: o.longitude + Math.cos(a) * 0.0006, approx: true };
    }
    return null;
  }).filter(Boolean);

  const all = [
    ...cleanOutlets.map((o) => ({ lat: o.latitude, lng: o.longitude })),
    ...resolvedStaff.map((s) => ({ lat: s.latitude, lng: s.longitude })),
  ];
  if (all.length === 0) return null;

  const lats = all.map((p) => p.lat);
  const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const kx = Math.cos((meanLat * Math.PI) / 180) || 1;
  const xs = all.map((p) => p.lng * kx);

  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Half-spans, floored (~2.2 km) so a single outlet isn't an infinite zoom.
  const MIN_HALF = 0.01;
  let halfX = Math.max((Math.max(...xs) - Math.min(...xs)) / 2, MIN_HALF) * 1.18;
  let halfY = Math.max((Math.max(...lats) - Math.min(...lats)) / 2, MIN_HALF) * 1.18;

  // Match the data aspect ratio to the panel box so nothing is stretched.
  const boxAspect = (box.w - PAD * 2) / (box.h - PAD * 2);
  const dataAspect = halfX / halfY;
  if (dataAspect < boxAspect) halfX = halfY * boxAspect;
  else halfY = halfX / boxAspect;

  const minX = cx - halfX, minY = cy - halfY;
  const scale = (box.w - PAD * 2) / (halfX * 2);

  const project = (lat, lng) => ({
    x: PAD + (lng * kx - minX) * scale,
    y: box.h - (PAD + (lat - minY) * scale), // invert: north = up
  });
  const metersToPx = scale / 111320;

  return {
    outletPts: cleanOutlets.map((o) => ({
      id: o.id,
      name: o.name,
      address: o.address || '',
      r: Math.min((o.geofenceRadiusMeters || 0) * metersToPx, 46),
      ...project(o.latitude, o.longitude),
    })),
    staffPts: resolvedStaff.map((s) => ({
      staffName: s.staffName || s.userId || 'Staff',
      outletName: s.outletName || '',
      approx: s.approx,
      ...project(s.latitude, s.longitude),
    })),
  };
}

function isNum(v) { return typeof v === 'number' && !Number.isNaN(v); }
