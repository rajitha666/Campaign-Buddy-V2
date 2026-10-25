// Pure logic for the review brief: classify changed paths, decide which reviewers a change needs
// (docs/agent-team/roles.md "Change profile"), and scan added diff lines for mechanical red flags.
// No I/O here so it is unit-tested; review-brief.mjs does the git + file reading.

const norm = (p) => p.replace(/\\/g, '/');

export function classifyPath(path) {
  const p = norm(path);
  const isTest = /(^|\/)(test|tests|e2e|__tests__)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
  let area = 'other';
  if (p.startsWith('campaign-buddy-portal/')) area = 'portal';
  else if (p.startsWith('campaign-buddy-app/')) area = 'app';
  else if (p.startsWith('campaign-buddy-backend/')) area = 'backend';
  else if (p.startsWith('campaign-buddy-mcp/')) area = 'mcp';
  else if (p.startsWith('marketing/training/')) area = 'guides';
  else if (p.startsWith('marketing/')) area = 'marketing';
  else if (p.startsWith('.claude/') || p.startsWith('scripts/agent/') || p.startsWith('product-owner-agent/') || p.startsWith('triage-agent/')) area = 'agents';
  else if (p.startsWith('.github/') || /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*)$/.test(p) || /\.sh$/.test(p)) area = 'infra';
  else if (p.startsWith('docs/') || /(^|\/)(README|AGENTS|CLAUDE|INSTALLATION_GUIDE)[^/]*\.md$/.test(p) || /\.md$/.test(p)) area = 'docs';
  const sourceUi = (area === 'portal' || area === 'app') && !isTest && (/\.(jsx|tsx|css)$/.test(p) || /\/src\/(screens|pages|components|navigation)\//.test(p));
  const contract = area === 'backend' && !isTest && (/\/src\/modules\/.*\.routes\.ts$/.test(p) || /\/src\/schemas\.ts$/.test(p));
  const schema = area === 'backend' && /\/prisma\/(schema\.prisma|migrations\/)/.test(p);
  const authish = area === 'backend' && !isTest && /\/src\/(middleware|modules\/auth)|auth/.test(p);
  const sync = area === 'app' && !isTest && /(offline|sync|queue)/i.test(p);
  return { area, isTest, ui: sourceUi, contract, schema, auth: authish, sync };
}

/** Which reviewers does this change need, given the mode? `files` = array of paths. */
export function profileFiles(files, { major = false, mode = 'full' } = {}) {
  const infos = files.map((f) => ({ path: norm(f), ...classifyPath(f) }));
  const src = infos.filter((i) => !i.isTest);
  const areas = [...new Set(infos.map((i) => i.area))].sort();
  const touchesUi = infos.some((i) => i.ui);
  const touchesBackend = src.some((i) => i.area === 'backend' || i.area === 'mcp');
  const risky = infos.some((i) => i.contract || i.schema || i.auth || i.sync);
  const onlyDocsish = src.length > 0 && src.every((i) => ['docs', 'guides', 'marketing'].includes(i.area));
  const onlyMarketing = src.length > 0 && src.every((i) => i.area === 'marketing');
  const testsOnly = infos.length > 0 && src.length === 0;
  const infraOnly = src.length > 0 && src.every((i) => i.area === 'infra' || i.area === 'agents');

  const reasons = [];
  const full = new Set();
  if (testsOnly) { full.add('QA'); reasons.push('tests only'); }
  if (touchesUi) { ['UX/UI', 'QA', 'Docs'].forEach((r) => full.add(r)); reasons.push('portal/app UI'); }
  if (touchesBackend) { ['Architect', 'QA'].forEach((r) => full.add(r)); reasons.push('backend/MCP'); }
  if (onlyDocsish) { full.add(onlyMarketing ? 'Marketing' : 'Docs'); reasons.push('docs/marketing only'); }
  if (infraOnly) { full.add('Architect'); reasons.push('infra/agent tooling'); }
  if (!full.size && src.length) { full.add('QA'); reasons.push('other source'); }
  if (major) { full.add('Marketing'); reasons.push('tagged major'); }

  let reviewers;
  let note = '';
  if (mode === 'off') { reviewers = []; note = 'Team mode is OFF: no agent reviewers. Automatic checks (tests/build/CI) still apply.'; }
  else if (mode === 'light') {
    const l = new Set();
    if (full.has('QA')) l.add('QA');
    if (full.has('Architect') && (major || risky)) l.add('Architect');
    if (full.has('UX/UI') && major) l.add('UX/UI');
    if (major) l.add('Marketing');
    reviewers = [...l];
    note = 'Team mode is LIGHT: Product Owner (intake + merge) and QA; Architect only if major/risky; UX/UI only if major; Docs/Marketing on request.';
  } else reviewers = [...full];
  const order = ['Architect', 'UX/UI', 'QA', 'Docs', 'Marketing'];
  reviewers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { areas, reasons, reviewers, risky, touchesUi, touchesBackend, major, mode, note, infos };
}

/** Parse `git diff -U0` text into added lines: [{file, line, text}]. */
export function parseAdded(diff) {
  const out = [];
  let file = null; let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) { const m = raw.match(/^\+\+\+ b\/(.*)$/); file = m ? m[1] : null; continue; }
    const h = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { line = Number(h[1]); continue; }
    if (!file) continue;
    if (raw.startsWith('+') && !raw.startsWith('+++')) { out.push({ file, line, text: raw.slice(1) }); line += 1; }
  }
  return out;
}

const isSeedOrDocs = (p) => /(^|\/)(seed|demo-seed)\.ts$/.test(p) || /\.md$/.test(p) || /(^|\/)marketing\//.test(p);

/** Mechanical red flags on added lines. `softDeleteModels` = Prisma model names (camelCase) that have deletedAt/archivedAt. */
export function scanAdded(added, { softDeleteModels = [] } = {}) {
  const flags = { locale: [], colors: [], fontPx: [], nativeDialogs: [], routes: [], migrationRisk: [], softDelete: [] };
  const byFile = new Map();
  for (const a of added) { if (!byFile.has(a.file)) byFile.set(a.file, []); byFile.get(a.file).push(a); }
  for (const a of added) {
    const c = classifyPath(a.file);
    const ref = `${a.file}:${a.line}`;
    const t = a.text;
    const code = !c.isTest && ['portal', 'app', 'backend'].includes(c.area) && !isSeedOrDocs(a.file);
    if (code && /\b(LKR|Asia\/Colombo)\b|['"`]\+94|\+94\d{8,}/.test(t)) flags.locale.push(ref);
    const styleFile = /\.(css|jsx|tsx)$/.test(a.file) && !/(^|\/)tokens\.css$/.test(a.file) && !c.isTest;
    if (styleFile && /#[0-9a-fA-F]{3,8}\b/.test(t) && !/^\s*(\/\/|\/\*)/.test(t)) flags.colors.push(`${ref} ${(t.match(/#[0-9a-fA-F]{3,8}\b/) || [''])[0]}`);
    if (/\.css$/.test(a.file) && !/(^|\/)tokens\.css$/.test(a.file) && /font-size:\s*\d+(\.\d+)?px/.test(t)) flags.fontPx.push(ref);
    if (!c.isTest && /window\.(confirm|alert)\(/.test(t)) flags.nativeDialogs.push(ref);
    if (c.area === 'backend' && /\/src\/modules\//.test(a.file) && (/router\.(get|post|put|patch|delete)\(/.test(t) || /^\s*["'`]\/[A-Za-z:]/.test(t))) {
      flags.routes.push(`${ref} ${t.trim().slice(0, 80)}`);
    }
    if (/\/prisma\/migrations\/.*\.sql$/.test(a.file) && /DROP\s+(TABLE|COLUMN)|SET\s+NOT\s+NULL|RENAME\b|DROP\s+CONSTRAINT/i.test(t)) flags.migrationRisk.push(`${ref} ${t.trim().slice(0, 80)}`);
  }
  if (softDeleteModels.length) {
    for (const [file, lines] of byFile) {
      const c = classifyPath(file);
      if (c.area !== 'backend' || c.isTest || isSeedOrDocs(file)) continue;
      lines.forEach((a, i) => {
        const m = a.text.match(/prisma\.(\w+)\.(findMany|findFirst|findUnique|count)\(/);
        if (!m || !softDeleteModels.includes(m[1])) return;
        const window = lines.slice(i, i + 4).map((x) => x.text).join(' ');
        if (!/deletedAt|archivedAt|status\s*:/.test(window)) flags.softDelete.push(`${file}:${a.line} prisma.${m[1]}.${m[2]}(…)`);
      });
    }
  }
  return flags;
}

/** Flags that need the changed-file list rather than line text. */
export function coverageFlags(infos, { routesTouched = false } = {}) {
  const src = infos.filter((i) => !i.isTest);
  const codeAreas = ['portal', 'app', 'backend', 'mcp'];
  const sourceChanged = src.some((i) => codeAreas.includes(i.area));
  const testsChanged = infos.some((i) => i.isTest);
  const guidesChanged = infos.some((i) => i.area === 'guides' || /docs\/product-documentation\.md$/.test(i.path));
  const apiDocChanged = infos.some((i) => /docs\/api-spec\.md$/.test(i.path));
  const mcpCoverageChanged = infos.some((i) => /campaign-buddy-mcp\/coverage\.json$/.test(i.path));
  const uiChanged = infos.some((i) => i.ui);
  const out = [];
  if (sourceChanged && !testsChanged) out.push('source changed but NO test file changed');
  if (uiChanged && !guidesChanged) out.push('UI changed but no user guide / product doc changed');
  if (routesTouched && !apiDocChanged) out.push('backend routes touched but docs/api-spec.md unchanged');
  if (routesTouched && !mcpCoverageChanged) out.push('backend routes touched but campaign-buddy-mcp/coverage.json unchanged (CI coverage gate)');
  return out;
}
