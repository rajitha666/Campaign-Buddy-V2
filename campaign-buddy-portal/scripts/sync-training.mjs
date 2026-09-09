// Copies the role training guides from marketing/training/ into public/training/
// so the portal serves them same-origin at /training/<role>.html during
// `npm run dev` and in `npm run build` output.
//
// Runs automatically via the `predev` / `prebuild` npm hooks. Safe to run by
// hand: `npm run sync:training`.
//
// In the portal Docker image the marketing/ tree is outside the build context,
// so the source is absent — that is expected. Production serves /training/ by
// proxying to the marketing container (see nginx.conf); this script no-ops.

import { existsSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../marketing/training');
const dest = resolve(here, '../public/training');

if (!existsSync(src)) {
  console.log('[sync-training] marketing/training not found — skipping (expected in Docker build).');
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, {
  recursive: true,
  filter: (p) => !p.endsWith('.md'), // README.md / MAINTENANCE.md are repo docs
});

console.log(`[sync-training] copied ${src} -> ${dest}`);
