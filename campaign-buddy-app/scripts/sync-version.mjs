#!/usr/bin/env node
/**
 * version.json is the single source of truth for the app's version.
 *
 * It used to live in three places that had already drifted apart --
 * app.json said 1.0.13, package.json said 1.0.4, build.gradle said 100013.
 * With one store binary serving many tenant backends, the version the app
 * reports is what every fleet decision is made on (upgrade gates, OTA channel
 * matching, per-tenant version histograms), so it has to be exactly one number.
 *
 *   npm run version:sync          rewrite the generated files from version.json
 *   npm run version:sync -- --check   verify they match; exit 1 if not (CI)
 *
 * Build numbers are derived, never hand-written: major * 100000 + minor * 1000 + patch.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const source = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));
const { version, build } = source;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`version.json: "${version}" is not a three-part semver`);
}
const [major, minor, patch] = version.split('.').map(Number);
const expectedBuild = major * 100_000 + minor * 1_000 + patch;
if (build !== expectedBuild) {
  throw new Error(`version.json: build ${build} does not match version ${version} (expected ${expectedBuild})`);
}

const problems = [];

/** Apply `edit` to a file; in --check mode only report whether it would change. */
function sync(relPath, edit) {
  const abs = join(root, relPath);
  const before = readFileSync(abs, 'utf8');
  const after = edit(before);
  if (before === after) return;
  if (check) problems.push(relPath);
  else writeFileSync(abs, after);
}

sync('package.json', (s) => s.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`));

sync('app.json', (s) => {
  let out = s.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
  // Keep ios.buildNumber in step too; Expo reads it for store submissions.
  out = /"buildNumber":/.test(out)
    ? out.replace(/("buildNumber":\s*")[^"]*(")/, `$1${build}$2`)
    : out.replace(/("bundleIdentifier":\s*"[^"]*",)/, `$1\n      "buildNumber": "${build}",`);
  return out;
});

sync('android/app/build.gradle', (s) =>
  s
    .replace(/versionCode\s+\d+/, `versionCode ${build}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)
);

if (check && problems.length) {
  console.error(
    `Version drift: ${problems.join(', ')} do not match version.json (${version} / ${build}).\n` +
      `Run: npm run version:sync`
  );
  process.exit(1);
}

console.log(check ? `Version in sync: ${version} (${build})` : `Synced to ${version} (${build})`);
