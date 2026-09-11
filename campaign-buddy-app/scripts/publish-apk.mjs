#!/usr/bin/env node
/**
 * publishes a built release APK to the downloads page.
 *
 * run after building the release APK:
 *   node scripts/publish-apk.mjs
 *
 * reads expo.version from app.json (the source of truth), cross-checks
 * android/app/build.gradle, computes the version code as
 * major*100000 + minor*100 + patch, copies the apk to
 * marketing/downloads/apk/campaignbuddy-<code>.apk and inserts a row
 * above the  <!-- VERSIONS -->  marker in marketing/downloads/index.html.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(appDir, "..");

const appJsonPath = path.join(appDir, "app.json");
const gradlePath = path.join(appDir, "android", "app", "build.gradle");
const apkPath = path.join(
  appDir,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk"
);
const downloadsDir = path.join(repoDir, "marketing", "downloads");
const apkDir = path.join(downloadsDir, "apk");
const pagePath = path.join(downloadsDir, "index.html");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`WARNING: ${msg}`);
}

function computeVersionCode(version) {
  const parts = version.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    fail(`version "${version}" is not in major.minor.patch form`);
  }
  const [major, minor, patch] = parts;
  if (minor > 99 || patch > 99) {
    fail(`minor/patch of "${version}" exceed 99; version code would overflow`);
  }
  return major * 100000 + minor * 100 + patch;
}

// --- read version -----------------------------------------------------------

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const version = appJson?.expo?.version;
if (!version) fail(`expo.version not found in app.json`);

const gradle = fs.readFileSync(gradlePath, "utf8");
const gradleName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (gradleName !== version) {
  fail(
    `app.json version (${version}) does not match android/app/build.gradle versionName (${gradleName ?? "not found"}).\n` +
      `Run "npx expo prebuild" or update build.gradle, then rebuild the APK.`
  );
}

const code = computeVersionCode(version);

// --- built apk --------------------------------------------------------------

if (!fs.existsSync(apkPath)) {
  fail(
    `release APK not found at ${apkPath}.\n` +
      `Build it first: cd campaign-buddy-app/android && ./gradlew assembleRelease`
  );
}

if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });

const apkName = `campaignbuddy-${code}.apk`;
const apkDest = path.join(apkDir, apkName);
fs.copyFileSync(apkPath, apkDest);

// --- downloads page row -----------------------------------------------------

const label = new Date().toISOString().slice(0, 10);
const emptyRow =
  /^[ \t]*<tr><td colspan="4" class="empty".*?<\/tr>\n/m;
const row = [
  "          <tr>",
  `            <td><span class="ver">${version}</span></td>`,
  `            <td><span class="code">${code}</span></td>`,
  `            <td><span class="date">${label}</span></td>`,
  `            <td class="dl"><a class="dl-btn" href="apk/${apkName}">`,
  `              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  `              Download`,
  "            </a></td>",
  "          </tr>",
].join("\n");

let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes("<!-- VERSIONS -->")) {
  fail(`"<!-- VERSIONS -->" marker missing in marketing/downloads/index.html`);
}

const alreadyListed = page.match(
  new RegExp(`<span class="ver">${version.replace(/\./g, "\\.")}</span>`)
);
if (alreadyListed) {
  warn(
    `version ${version} already has a row on the downloads page; stopping.\n` +
      `Bump expo.version in app.json for a new release.`
  );
  process.exit(2);
}

page = page.replace(emptyRow, "");
page = page.replace(
  /^([ \t]*)<!-- VERSIONS -->$/m,
  (_, ind) => `${row}\n${ind}<!-- VERSIONS -->`
);

fs.writeFileSync(pagePath, page);

console.log(`Published release ${version} (code ${code})`);
console.log(`  APK:  marketing/downloads/apk/${apkName}`);
console.log(`  Row:  marketing/downloads/index.html (${label})`);
console.log(`Next: git add marketing/downloads && git commit && git push`);
