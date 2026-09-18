import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression: the answers table used to show every feedback type from every
// outlet interleaved in one flat list — hard to read. It must group rows by
// outlet with a header per outlet.
describe('SupervisorTaskResults groups answers by outlet', () => {
  const page = readFileSync(fileURLToPath(new URL('../pages/SupervisorTaskResults.jsx', import.meta.url)), 'utf8');

  it('splits the displayed rows into outlet groups', () => {
    expect(page).toContain('groupByOutlet');
  });

  it('renders an outlet header block before its rows', () => {
    expect(page).toMatch(/colSpan.*outletName|outletName.*colSpan/s);
  });
});
