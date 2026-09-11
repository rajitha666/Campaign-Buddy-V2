/*
 * Designed marketing screenshots for the App Store / Play Store listings.
 * Off-white brand background, Poppins caption (emphasis word in mango),
 * device-framed app screenshot, soft shadow. Rasterised with sharp so the
 * output pixel size is exact. No browser.
 *
 *   cd marketing/store && npm i sharp opentype.js && node gen-screenshots.js
 *
 * Reads the field-rep captures from marketing/training/assets/mobile-promoter/
 * and Poppins TTFs from the mobile app's node_modules. Re-run and re-copy into
 * mobile/screenshots/ if the app UI or captures change.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');

const REPO = path.resolve(__dirname, '..', '..');
const APP = path.join(REPO, 'campaign-buddy-app');
const SHOTS = path.join(REPO, 'marketing/training/assets/mobile-promoter');
const OUT = path.join(REPO, 'marketing/store/mobile/screenshots');

const INK = '#12241F';
const MANGO = '#FF7A33';
const BG = '#F4F6F3';
const SUB = '#5B6B64';

const loadFont = (p) => opentype.parse(fs.readFileSync(p).buffer.slice(0));
const fontBold = loadFont(APP + '/node_modules/@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf');
const fontMed = loadFont(APP + '/node_modules/@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf');

// screenshot native aspect (w/h)
const SHOT_AR = 640 / 1385;

// --- the set: source file, caption lines (*word* = mango), subcaption ---
const SLIDES = [
  { src: '11-check-in.webp',           lines: ['GPS *check-in*', 'at the outlet'],      sub: 'Your location is verified when the shift starts' },
  { src: '01-home.webp',               lines: ['Your whole shift,', 'one *screen*'],    sub: 'Sales, stock and footfall as the day runs' },
  { src: '04-product-update.webp',     lines: ['*Stock and sales*', 'per product'],     sub: 'Remaining count updates live, flag a reorder in a tap' },
  { src: '05-sales-summary.webp',      lines: ['*Confirm the day*', 'before checkout'],  sub: 'Footfall, conversion and what moved the numbers' },
  { src: '03-products.webp',           lines: ['Every SKU,', '*tracked live*'],         sub: 'Sold against opening stock, per outlet, per day' },
  { src: '07-performance.webp',        lines: ['See how', "you're *tracking*"],         sub: 'Sales, best day and top products for the campaign' },
  { src: '02-attendance-on-shift.webp',lines: ['*On time,*', 'and it shows'],           sub: 'Every check-in timed against the planned shift' },
];

const SIZES = [
  { name: 'apple-6.7', w: 1290, h: 2796 },
  { name: 'play-phone', w: 1080, h: 2160 },
];

function measure(font, text, size) {
  const scale = size / font.unitsPerEm;
  let w = 0;
  const glyphs = font.stringToGlyphs(text);
  for (let i = 0; i < glyphs.length; i++) {
    w += glyphs[i].advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const k = font.getKerningValue(glyphs[i], glyphs[i + 1]);
      w += k * scale;
    }
  }
  return w;
}

// Serialise an opentype Path from its command list. opentype.js' own
// Path.toPathData()/toSVG() emit strings that resvg mis-renders (dropped or
// point-reflected glyphs); walking .commands ourselves avoids that entirely.
function pathD(p) {
  let s = '';
  for (const c of p.commands) {
    if (c.type === 'M') s += `M${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    else if (c.type === 'L') s += `L${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    else if (c.type === 'Q') s += `Q${c.x1.toFixed(2)} ${c.y1.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    else if (c.type === 'C') s += `C${c.x1.toFixed(2)} ${c.y1.toFixed(2)} ${c.x2.toFixed(2)} ${c.y2.toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    else if (c.type === 'Z') s += 'Z';
  }
  return s;
}

// Rasterise one caption line (may contain *emphasis* segments) on its own
// canvas. Baseline sits at Math.ceil(size * 1.15).
async function lineRaster(font, raw, size) {
  const segs = [];
  raw.split('*').forEach((chunk, i) => { if (chunk) segs.push({ text: chunk, em: i % 2 === 1 }); });
  const pad = Math.ceil(size * 0.4);
  const baseline = Math.ceil(size * 1.15);
  let x = pad;
  let inkPath = '';
  let emPath = '';
  for (const seg of segs) {
    const p = font.getPath(seg.text, x, baseline, size);
    if (seg.em) emPath += pathD(p); else inkPath += pathD(p);
    x += measure(font, seg.text, size);
  }
  const w = Math.ceil(x) + pad;
  const h = Math.ceil(size * 1.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
    + (inkPath ? `<path d="${inkPath}" fill="${INK}"/>` : '')
    + (emPath ? `<path d="${emPath}" fill="${MANGO}"/>` : '')
    + '</svg>';
  return { buf: await sharp(Buffer.from(svg)).png().toBuffer(), w, h, baseline };
}

async function roundedShot(srcBuf, w, h, r) {
  const img = await sharp(srcBuf).resize(w, h, { fit: 'cover', position: 'top' }).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function build(slide, size) {
  const { w: W, h: H } = size;
  const margin = Math.round(W * 0.085);
  const capSize = Math.round(W * 0.076);
  const capLead = Math.round(capSize * 1.16);
  const subSize = Math.round(W * 0.032);

  const capTop = Math.round(H * 0.055);
  const textLayers = [];
  let ty = capTop + capSize;
  for (const ln of slide.lines) {
    const r = await lineRaster(fontBold, ln, capSize);
    textLayers.push({ input: r.buf, left: Math.round((W - r.w) / 2), top: Math.round(ty - r.baseline) });
    ty += capLead;
  }
  const subY = ty - capLead + Math.round(capSize * 0.35) + subSize;
  const subR = await lineRaster(fontMed, slide.sub, subSize);
  textLayers.push({ input: subR.buf, left: Math.round((W - subR.w) / 2), top: Math.round(subY - subR.baseline) });

  // phone fits the space between the caption and the bottom margin
  const bezel = Math.round(W * 0.018);
  const bodyR = Math.round(W * 0.083);
  const screenR = Math.round(W * 0.06);
  const availTop = subY + Math.round(H * 0.035);
  const availBot = H - Math.round(H * 0.045);
  let bodyH = availBot - availTop;
  let scrH = bodyH - bezel * 2;
  let scrW = Math.round(scrH * SHOT_AR);
  let bodyW = scrW + bezel * 2;
  const maxBodyW = W - margin * 2 + Math.round(W * 0.05);
  if (bodyW > maxBodyW) {
    bodyW = maxBodyW;
    scrW = bodyW - bezel * 2;
    scrH = Math.round(scrW / SHOT_AR);
    bodyH = scrH + bezel * 2;
  }
  const bodyX = Math.round((W - bodyW) / 2);
  const bodyY = availTop + Math.round((availBot - availTop - bodyH) / 2);
  const scrX = bodyX + bezel;
  const scrY = bodyY + bezel;

  // base: bg + soft shadow + phone body (NO text here)
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="${Math.round(W * 0.02)}" stdDeviation="${Math.round(W * 0.028)}" flood-color="#12241F" flood-opacity="0.22"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyR}" ry="${bodyR}" fill="${INK}" filter="url(#sh)"/>
    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyR}" ry="${bodyR}" fill="${INK}"/>
  </svg>`;

  const baseBuf = await sharp(Buffer.from(bg)).png().toBuffer();
  const shotBuf = fs.readFileSync(path.join(SHOTS, slide.src));
  const scr = await roundedShot(shotBuf, scrW, scrH, screenR);

  const n = String(SLIDES.indexOf(slide) + 1).padStart(2, '0');
  const label = slide.src.replace(/^\d+-/, '').replace(/\.webp$/, '');
  const outFile = path.join(OUT, size.name, `${n}-${label}.png`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(baseBuf)
    .composite([
      ...textLayers,
      { input: scr, left: scrX, top: scrY },
    ])
    .png()
    .toFile(outFile);
  return outFile;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const size of SIZES) {
    for (const slide of SLIDES) {
      const f = await build(slide, size);
      console.log('wrote', path.relative(OUT, f));
    }
  }
  console.log('\nDone ->', OUT);
})();
