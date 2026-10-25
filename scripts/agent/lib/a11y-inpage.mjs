// In-page accessibility/layout checks, run by shoot.mjs through page.evaluate (must be self-contained: it is
// serialised and executed inside the browser). Dependency-free; covers the checks the UX/UI Architect cares about
// most and can't see from code. Returns a compact JSON object.
export function inPageChecks() {
  const out = { overflow: null, issues: [] };
  const push = (rule, el, extra) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    out.issues.push({ rule, el: `${tag}${id}${cls}`.slice(0, 60), ...extra });
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || '').trim();

  // horizontal page overflow
  const de = document.documentElement;
  out.overflow = de.scrollWidth > de.clientWidth + 1 ? { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth } : null;

  // names: buttons, links, icon-only controls, images, inputs
  document.querySelectorAll('button, a[href], [role="button"], [role="link"]').forEach((el) => {
    if (!visible(el)) return;
    if (!name(el) && !el.querySelector('img[alt]:not([alt=""])')) push('no-accessible-name', el, {});
  });
  document.querySelectorAll('img').forEach((el) => { if (visible(el) && !el.hasAttribute('alt')) push('img-no-alt', el, {}); });
  document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((el) => {
    if (!visible(el)) return;
    const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label') || el.getAttribute('placeholder');
    if (!labelled) push('input-no-label', el, {});
  });

  // duplicate ids
  const seen = new Map();
  document.querySelectorAll('[id]').forEach((el) => seen.set(el.id, (seen.get(el.id) || 0) + 1));
  for (const [id, n] of seen) if (n > 1) out.issues.push({ rule: 'duplicate-id', el: `#${id}`, count: n });

  // heading order (skipped levels)
  let prev = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => { if (!visible(h)) return; const l = Number(h.tagName[1]); if (prev && l > prev + 1) push('heading-skip', h, { from: `h${prev}`, to: `h${l}` }); prev = l; });

  // touch target size (WCAG 2.2 AA minimum 24px; design target 44px) for interactive controls
  document.querySelectorAll('button, a[href], [role="button"], input:not([type=hidden]), select, summary').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return; // inline text links are exempt
    if (r.width < 24 || r.height < 24) push('target-under-24px', el, { w: Math.round(r.width), h: Math.round(r.height) });
  });

  // text contrast (sample of visible text-bearing elements; effective background from ancestors)
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  let checked = 0; const lowContrast = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && checked < 400) {
    const n = walker.currentNode; const t = n.textContent.trim(); if (t.length < 3) continue;
    const el = n.parentElement; if (!el || !visible(el)) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); checked++;
    const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) { const k = `${cs.color}|${cs.backgroundColor}`; if (!lowContrast.has(k)) { const o = { rule: 'low-contrast', el: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''), ratio: Math.round(ratio * 100) / 100, need, sample: t.slice(0, 30) }; lowContrast.set(k, o); } }
  }
  out.issues.push(...lowContrast.values());

  // fonts below the design floor
  let small = 0; document.querySelectorAll('body *').forEach((el) => { if (el.children.length === 0 && el.textContent.trim().length > 2 && visible(el) && parseFloat(getComputedStyle(el).fontSize) < 11) small++; });
  if (small) out.issues.push({ rule: 'text-under-11px', count: small });
  return out;
}
