import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// GPS breadcrumb trail for a single promoter/date (issue #39) — a path
// connecting the ordered pings plus a pin at each, so the walked route is
// visible instead of just a raw lat/lng table. Rows already come back
// ordered by capturedAt ascending (see operations.routes.ts trackingHistory).
const START_ICON = L.divIcon({ className: 'trail-endpoint-icon trail-start', html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
const END_ICON = L.divIcon({ className: 'trail-endpoint-icon trail-end', html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] });

export default function PromoterTrailMap({ rows = [], height = 360 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const points = useMemo(
    () => (rows || []).filter((r) => isNum(r.latitude) && isNum(r.longitude)).map((r) => ({
      lat: r.latitude, lng: r.longitude, capturedAt: r.capturedAt, outletName: r.outletName || '',
    })),
    [rows]
  );

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
    const timers = [60, 250, 600, 1200].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => { timers.forEach(clearTimeout); map.remove(); mapRef.current = null; };
  }, []);

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
    if (!map || !layer) return undefined;
    layer.clearLayers();

    if (points.length > 0) {
      const latlngs = points.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, { color: '#E5762B', weight: 3, opacity: 0.8 }).addTo(layer);
      points.forEach((p, i) => {
        const isEndpoint = i === 0 || i === points.length - 1;
        const time = p.capturedAt ? new Date(p.capturedAt).toLocaleTimeString() : '';
        if (isEndpoint) {
          L.marker([p.lat, p.lng], { icon: i === 0 ? START_ICON : END_ICON })
            .bindTooltip(`<b>${i === 0 ? 'Start' : 'Last seen'}</b>${time ? `<br>${time}` : ''}${p.outletName ? `<br>${esc(p.outletName)}` : ''}`, { direction: 'top' })
            .addTo(layer);
        } else {
          L.circleMarker([p.lat, p.lng], { radius: 4, color: '#fff', weight: 1.5, fillColor: '#E5762B', fillOpacity: 1 })
            .bindTooltip(time, { direction: 'top' })
            .addTo(layer);
        }
      });
    }

    const pts = points.map((p) => [p.lat, p.lng]);
    const fit = () => {
      if (pts.length === 0) return;
      map.invalidateSize();
      if (pts.length === 1) { map.setView(pts[0], 15); return; }
      const b = L.latLngBounds(pts);
      if (!b.isValid() || b.getNorth() - b.getSouth() < 0.001) map.setView(b.getCenter(), 15);
      else map.fitBounds(b.pad(0.25), { maxZoom: 17 });
    };
    fit();
    const t = setTimeout(fit, 350);
    return () => clearTimeout(t);
  }, [points]);

  return (
    <div className="map-shell" style={{ height, position: 'relative' }}>
      <div ref={elRef} className="leaflet-host" style={{ height: '100%' }} />
      {points.length === 0 ? (
        <div className="map-overlay-note">No GPS pings for this selection yet.</div>
      ) : null}
    </div>
  );
}

const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
