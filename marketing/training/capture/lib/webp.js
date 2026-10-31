import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const TRAINING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Screenshot a page (or a specific element) and write it straight to WebP at
// `outfile`, given relative to marketing/training/ (e.g.
// "assets/portal-admin/12-staff-attendance.webp") — the repo's single source
// for these assets, see MAINTENANCE.md.
//
// `fullPage` defaults to true (grow the shot to the whole scrollable page).
// Pass `{ fullPage: false }` for a screen whose shot should be exactly the
// viewport — e.g. a phone screen with a pinned bottom tab bar.
export async function shootToWebp(target, outfile, { fullPage = true } = {}) {
  const buffer = await target.screenshot({ fullPage, type: 'png' });
  const outPath = path.join(TRAINING_DIR, outfile);
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(buffer).webp({ quality: 82 }).toFile(outPath);
  console.log(`  wrote ${outfile}`);
}
