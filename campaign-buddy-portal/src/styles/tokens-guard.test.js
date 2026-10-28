// Guard: type, radius and spacing come from tokens.css. A raw px literal in
// app.css means a new ad-hoc size; add or reuse a token instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const css = read('./app.css').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('./tokens.css');

const literals = (prop) =>
  [...css.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]*)`, 'g'))]
    .map((m) => m[1])
    .filter((v) => /\d(\.\d+)?px/.test(v.replace(/var\([^)]*\)/g, '')));

describe('design tokens', () => {
  it('defines the type, radius, spacing and motion scales', () => {
    for (const t of ['--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl',
      '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill', '--space-1', '--space-2',
      '--space-3', '--space-4', '--space-6', '--space-8', '--shadow-card', '--shadow-popover',
      '--shadow-modal', '--ease', '--dur-fast']) {
      expect(tokens, t).toContain(`${t}:`);
    }
    expect(tokens).toMatch(/prefers-reduced-motion/);
  });

  it('app.css has no raw font-size px literals', () => {
    expect(literals('font-size')).toEqual([]);
  });

  it('app.css has no raw border-radius px literals', () => {
    expect(literals('border-radius')).toEqual([]);
  });

  it('app.css padding and gap use the spacing scale (hairlines <=3px and page gutters >32px allowed)', () => {
    const raw = [...literals('padding'), ...literals('gap')].filter((v) =>
      (v.replace(/var\([^)]*\)/g, '').match(/\d+(\.\d+)?px/g) || []).some((p) => parseFloat(p) > 3 && parseFloat(p) <= 32));
    expect(raw).toEqual([]);
  });
});
