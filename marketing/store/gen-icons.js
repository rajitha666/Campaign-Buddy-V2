/*
 * Builds the Campaign Buddy app icon, Android adaptive-icon foreground, splash
 * mark and web favicon from the chart-arrow logo in LoginScreen.tsx.
 *
 *   cd marketing/store && npm i sharp && node gen-icons.js
 *
 * Then copy icon.png / adaptive-icon.png / splash-icon.png / favicon.png into
 * campaign-buddy-app/assets/images/ (app.json points at them) and the store
 * icons into ./mobile/.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const MANGO = '#FF7A33';
const INK = '#12241F';

// The Campaign Buddy mark: rising chart line + arrow head, from LoginScreen.tsx.
// viewBox 0 0 24 24, white strokes.
function markSVG(size, stroke = 2.2, color = '#FFFFFF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <path d="M4 17L9 12L13 16L20 8" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 8H20V14" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Solid-color square with the mark centred at `markFrac` of the canvas width.
async function composedIcon(sizePx, bg, markFrac, stroke, outFile, { alphaBg = false } = {}) {
  const markPx = Math.round(sizePx * markFrac);
  const markPng = await sharp(Buffer.from(markSVG(markPx, stroke))).png().toBuffer();
  const base = alphaBg
    ? sharp({ create: { width: sizePx, height: sizePx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    : sharp({ create: { width: sizePx, height: sizePx, channels: 4, background: bg } });
  let img = base.composite([{ input: markPng, gravity: 'center' }]).png();
  if (!alphaBg) img = img.flatten({ background: bg }).removeAlpha();
  await img.toFile(path.join(OUT, outFile));
  console.log('wrote', outFile, `${sizePx}x${sizePx}`);
}

(async () => {
  // iOS app icon: mango field, white mark, no alpha, no rounding (Apple masks).
  await composedIcon(1024, MANGO, 0.66, 2.2, 'icon.png');

  // Android adaptive icon foreground: white mark on transparent, kept inside the
  // safe zone (centre ~66%). 0.58 of 1024 = 594px viewBox, well within it.
  await composedIcon(1024, null, 0.58, 2.2, 'adaptive-icon.png', { alphaBg: true });

  // Splash mark: white mark on transparent, shown on the ink background.
  await composedIcon(1024, null, 0.62, 2.0, 'splash-icon.png', { alphaBg: true });

  // Web favicon: mango field + white mark, small.
  await composedIcon(196, MANGO, 0.6, 2.4, 'favicon.png');

  // Store display icons (for reference / Play listing 512, Apple uses icon.png).
  await composedIcon(512, MANGO, 0.62, 2.2, 'play-store-icon-512.png');

  console.log('\nAll assets in', OUT);
})();
