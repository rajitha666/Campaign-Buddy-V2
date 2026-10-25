import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Destructive actions use the designed dialog (useConfirm), never the browser's
// native window.confirm / alert — those look unprofessional and can't be styled
// or tested. Keeps the pattern from creeping back in.
const root = fileURLToPath(new URL('..', import.meta.url));
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('no native browser dialogs', () => {
  it('no source file calls window.confirm / window.alert / confirm( / alert(', () => {
    const offenders = walk(root).filter((p) => /window\.(confirm|alert)\(|(^|[^.\w])(confirm|alert)\(\s*['"`]/m.test(readFileSync(p, 'utf8')));
    expect(offenders.map((p) => p.replace(root, ''))).toEqual([]);
  });
});
