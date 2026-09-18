import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ICONS } from './Icons';

// Real basemap (OpenStreetMap tiles via Leaflet) with outlet + live sales-staff
// markers. Staff use their last GPS ping; when none exists we fall back to the
// outlet they're checked in at (flagged "approx." in the popup).
// `highlightedStaffKey` (staffName/userId of a row clicked in a table below
// the map) rings that person's marker, opens its tooltip and pans to them.
const INK = '#12241F';

const staffIcon = L.divIcon({
  className: 'geo-staff-icon',
  html: '<span class="geo-staff-pulse-el"></span><span class="geo-staff-dot"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function fitMapToPoints(map, pts) {
  if (!map || pts.length === 0) return;
  map.invalidateSize();
  if (pts.length === 1) { map.setView(pts[0], 15); return; }
  const b = L.latLngBounds(pts);
  // Coincident / near-coincident points give a degenerate box — just centre.
  if (!b.isValid() || b.getNorth() - b.getSouth() < 0.001) map.setView(b.getCenter(), 15);
  else map.fitBounds(b.pad(0.3), { maxZoom: 16 });
}

export default function CampaignMap({ outlets = [], staff = [], height = 380, highlightedStaffKey = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  // Pan to the highlighted staff only when the selection *changes* — the 15s
  // live poll re-renders markers and must not yank the map back every time.
  const lastHighlightRef = useRef(null);
  // Auto-fit only the first time points show up — after that, periodic data
  // refreshes (e.g. the 15s live-position poll) must not override the user's
  // own pan/zoom (issue #40). "Recenter" below lets them opt back in.
  const didInitialFitRef = useRef(false);

  const model = useMemo(() => resolvePoints(outlets, staff), [outlets, staff]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.setView([7.8731, 80.7718], 7); // Sri Lanka, until points load
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The container is often still settling its width on first paint.
    const timers = [60, 250, 600, 1200].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => { timers.forEach(clearTimeout); map.remove(); mapRef.current = null; };
  }, []);

  // Keep the map sized to its container (panel width changes, sidebar collapse…).
  useEffect(() => {
    const host = elRef.current?.parentElement;
    if (!host) return undefined;
    const resize = () => mapRef.current?.invalidateSize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    if (elRef.current) ro.observe(elRef.current);
    window.addEventListener('resize', resize);
    return () => { ro.disconnect(); window.removeEventListener('resize', resize); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    model.outletPts.forEach((o) => {
      if (o.geofence > 0) {
        L.circle([o.lat, o.lng], { radius: o.geofence, color: '#2673B0', weight: 1, fillColor: '#2673B0', fillOpacity: 0.08 }).addTo(layer);
      }
      L.circleMarker([o.lat, o.lng], { radius: 7, color: '#fff', weight: 2.5, fillColor: INK, fillOpacity: 1 })
        .bindTooltip(`<b>${esc(o.name)}</b>${o.address ? `<br>${esc(o.address)}` : ''}`, { direction: 'top' })
        .addTo(layer);
    });

    model.staffPts.forEach((s) => {
      const marker = L.marker([s.lat, s.lng], { icon: staffIcon })
        .bindTooltip(
          `<b>${esc(s.staffName)}</b>${s.outletName ? `<br>${esc(s.outletName)}` : ''}${s.approx ? '<br><i>approx. — last GPS unavailable</i>' : ''}`,
          { direction: 'top' }
        )
        .addTo(layer);
      if (highlightedStaffKey != null && s.key === highlightedStaffKey) marker.openTooltip();
    });

    // Ring around the marker a table row was clicked for (issue: match
    // /tracking/promoter's row-click highlight there too).
    const hi = highlightedStaffKey != null ? model.staffPts.find((s) => s.key === highlightedStaffKey) : null;
    if (hi) {
      L.circleMarker([hi.lat, hi.lng], { radius: 18, color: '#111', weight: 2, opacity: 0.7, fill: false, interactive: false }).addTo(layer);
      // Pan to them only when the selection *changes* — the 15s live poll must
      // not yank the map back every refresh.
      if (lastHighlightRef.current !== highlightedStaffKey) {
        lastHighlightRef.current = highlightedStaffKey;
        map.setView([hi.lat, hi.lng], Math.max(map.getZoom(), 15));
        map.invalidateSize();
      }
    }
    if (highlightedStaffKey == null) lastHighlightRef.current = null;

    const pts = [...model.outletPts, ...model.staffPts].map((p) => [p.lat, p.lng]);
    if (didInitialFitRef.current || pts.length === 0) return undefined;
    didInitialFitRef.current = true;
    fitMapToPoints(map, pts);
    const t = setTimeout(() => fitMapToPoints(map, pts), 350); // re-fit once the container has its real size
    return () => clearTimeout(t);
  }, [model, highlightedStaffKey]);

  function recenter() {
    const pts = [...model.outletPts, ...model.staffPts].map((p) => [p.lat, p.lng]);
    fitMapToPoints(mapRef.current, pts);
  }

  return (
    <div className="map-shell" style={{ height, position: 'relative' }}>
      <div ref={elRef} className="leaflet-host" style={{ height: '100%' }} />
      {model.outletPts.length === 0 && model.staffPts.length === 0 ? (
        <div className="map-overlay-note">No outlet locations or checked-in staff to show yet.</div>
      ) : (
        <button type="button" className="map-recenter-btn" onClick={recenter} title="Re-fit the map to all current points">
          {ICONS.target} Recenter
        </button>
      )}
      <div className="map-legend">
        <div className="item"><span className="sw sw-staff" />Sales staff live ({model.staffPts.length})</div>
        <div className="item"><span className="sw sw-outlet" />Outlet ({model.outletPts.length})</div>
      </div>
    </div>
  );
}

function resolvePoints(outlets, staff) {
  const cleanOutlets = (outlets || []).filter((o) => isNum(o.latitude) && isNum(o.longitude));
  const outletByName = new Map(cleanOutlets.map((o) => [o.name, o]));

  const staffPts = (staff || []).map((s, i) => {
    const key = `${s.staffName || s.userId || 'Staff'}|${s.outletName || ''}`;
    const pos = s.lastPosition;
    if (pos && isNum(pos.latitude) && isNum(pos.longitude)) {
      return { key, lat: pos.latitude, lng: pos.longitude, staffName: label(s), outletName: s.outletName || '', approx: false };
    }
    const o = outletByName.get(s.outletName);
    if (o) {
      const a = (i * 2.399963) % (Math.PI * 2); // golden-angle jitter so co-located staff don't stack
      return { key, lat: o.latitude + Math.sin(a) * 0.0007, lng: o.longitude + Math.cos(a) * 0.0007, staffName: label(s), outletName: s.outletName || '', approx: true };
    }
    return null;
  }).filter(Boolean);

  const outletPts = cleanOutlets.map((o) => ({
    lat: o.latitude, lng: o.longitude, name: o.name, address: o.address || '',
    geofence: o.geofenceRadiusMeters || 0,
  }));

  return { outletPts, staffPts };
}

const label = (s) => s.staffName || s.userId || 'Staff';
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
