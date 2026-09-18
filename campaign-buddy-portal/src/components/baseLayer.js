import L from 'leaflet';

// Shared very-minimal basemap for all Leaflet maps in the portal: Esri World
// Light Gray — plain grey land, faint roads, no buildings. Keyless (no
// watermark; CARTO's anonymous raster tiles now carry an "API key required"
// watermark). Attribution kept as required by Esri's terms.
export function addBaseLayer(map) {
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Tiles &copy; Esri',
  }).addTo(map);
}
