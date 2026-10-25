import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const toast = read('./ToastContext.jsx');
const css = read('../styles/app.css');

describe('toast accessibility (WCAG 2.2.1 / 2.5.8)', () => {
  it('holds the auto-dismiss timer while hovered or focused, and clears timers on unmount', () => {
    expect(toast).toMatch(/onMouseEnter=\{\(\) => hold\(t\.id\)\}/);
    expect(toast).toMatch(/onFocus=\{\(\) => hold\(t\.id\)\}/);
    expect(toast).toMatch(/onBlur=\{\(\) => release\(t\.id\)\}/);
    expect(toast).toMatch(/clearTimeout\(t\.handle\)/);
  });

  it('has no nested live region (each toast carries its own role)', () => {
    expect(toast).not.toMatch(/aria-live/);
  });

  it('gives the Undo action a real hit target and uses design tokens, not raw colours', () => {
    expect(css).toMatch(/\.toast-action \{[^}]*min-height:36px/);
    expect(css).not.toMatch(/#FFB98F|#BF3A32/);
  });
});
