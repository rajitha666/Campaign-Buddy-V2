import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// GPS breadcrumb trail — one promoter/date (issue #39), or several at once
// when the Promoter filter is set to "All" (client doc E). Each promoter gets
// their own coloured trail; clicking their row in the table below sets
// `highlightedStaffId`, which brings their trail to full strength, dims the
// rest, and zooms the map to just their points. Rows already come back
// ordered by capturedAt ascending (see operations.routes.ts trackingHistory).
const TRAIL_COLORS = ['#E5762B', '#2E7D32', '#1565C0', '#8E24AA', '#C62828', '#00838F', '#6D4C41', '#AD1457'];
const DIM_OPACITY = 0.25;

export default function PromoterTrailMap({ rows = [], height = 360, highlightedStaffId = null }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // One group per promoter so "All" doesn't draw one line zig-zagging between
  // different people's positions.
  const trails = useMemo(() => {
    const byStaff = new Map();
    (rows || []).filter((r) => isNum(r.latitude) && isNum(r.longitude)).forEach((r) => {
      const key = r.staffId ?? '—';
      if (!byStaff.has(key)) byStaff.set(key, { staffId: r.staffId, staffName: r.staffName || '', points: [] });
      byStaff.get(key).points.push({ lat: r.latitude, lng: r.longitude, capturedAt: r.capturedAt, outletName: r.outletName || '' });
    });
    return Array.from(byStaff.values()).map((t, i) => ({ ...t, color: TRAIL_COLORS[i % TRAIL_COLORS.length] }));
  }, [rows]);

  const allPoints = useMemo(() => trails.flatMap((t) => t.points), [trails]);

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

    for (const trail of trails) {
      const dimmed = highlightedStaffId != null && trail.staffId !== highlightedStaffId;
      const opacity = dimmed ? DIM_OPACITY : 0.9;
      const { points, color } = trail;
      if (points.length === 0) continue;
      const latlngs = points.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, { color, weight: dimmed ? 2 : 3, opacity }).addTo(layer);
      points.forEach((p, i) => {
        const isEndpoint = i === 0 || i === points.length - 1;
        const time = p.capturedAt ? new Date(p.capturedAt).toLocaleTimeString() : '';
        const tooltip = `${trail.staffName ? `<b>${esc(trail.staffName)}</b><br>` : ''}${isEndpoint ? `<b>${i === 0 ? 'Start' : 'Last seen'}</b><br>` : ''}${time}${p.outletName ? `<br>${esc(p.outletName)}` : ''}`;
        L.circleMarker([p.lat, p.lng], { radius: isEndpoint ? 7 : 4, color: '#fff', weight: isEndpoint ? 2 : 1.5, fillColor: color, fillOpacity: opacity })
          .bindTooltip(tooltip, { direction: 'top' })
          .addTo(layer);
      });
    }

    // Zoom to the highlighted promoter's own points when one is selected,
    // otherwise fit everything currently drawn.
    const highlighted = highlightedStaffId != null ? trails.find((t) => t.staffId === highlightedStaffId) : null;
    const pts = (highlighted ? highlighted.points : allPoints).map((p) => [p.lat, p.lng]);
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
  }, [trails, allPoints, highlightedStaffId]);

  return (
    <div className="map-shell" style={{ height, position: 'relative' }}>
      <div ref={elRef} className="leaflet-host" style={{ height: '100%' }} />
      {allPoints.length === 0 ? (
        <div className="map-overlay-note">No GPS pings for this selection yet.</div>
      ) : null}
    </div>
  );
}

const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
