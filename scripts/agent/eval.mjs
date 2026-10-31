#!/usr/bin/env node
// Reviewer eval set: planted-defect changes that each reviewer role must catch, plus a clean control it must not block.
//   node scripts/agent/eval.mjs list
//   node scripts/agent/eval.mjs check                 # zero-token: the lints must flag the cases they claim to
//   node scripts/agent/eval.mjs apply <id>            # worktree ../cb-eval-<id> on branch eval/<id> with the planted change committed
//   node scripts/agent/eval.mjs grade <id> <file>     # grade a reviewer's saved output against the case
//   node scripts/agent/eval.mjs clean <id>            # remove that worktree and branch
// Cases live in docs/agent-team/evals/cases/<id>/ (case.json + files/ mirroring the repo). See docs/agent-team/evals/README.md.
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintSql, scanSoftDelete, softDeleteModels } from './lib/lint.mjs';
import { grade } from './lib/evals.mjs';

const repo = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const casesDir = join(repo, 'docs', 'agent-team', 'evals', 'cases');
const [cmd, id, file] = process.argv.slice(2);

const ids = () => readdirSync(casesDir).filter((d) => statSync(join(casesDir, d)).isDirectory());
const load = (c) => JSON.parse(readFileSync(join(casesDir, c, 'case.json'), 'utf8'));
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`); return r.stdout.trim(); };
const need = () => { if (!id || !ids().includes(id)) { console.error(`Unknown case "${id ?? ''}". Cases: ${ids().join(', ')}`); process.exit(2); } };

if (cmd === 'list') {
  for (const c of ids()) { const j = load(c); console.log(`${c.padEnd(22)} ${j.roles.join('+').padEnd(36)} ${j.title}`); }
} else if (cmd === 'check') {
  const schema = readFileSync(join(repo, 'campaign-buddy-backend', 'prisma', 'schema.prisma'), 'utf8');
  const models = softDeleteModels(schema);
  let bad = 0;
  for (const c of ids()) {
    const j = load(c); if (!j.mechanical) continue;
    const files = walk(join(casesDir, c, 'files'));
    let hit = false;
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (j.mechanical.lint === 'migration' && /\.sql$/.test(f)) hit ||= lintSql(text).some((x) => x.level === j.mechanical.expect);
      if (j.mechanical.lint === 'soft-delete' && /\.ts$/.test(f)) hit ||= scanSoftDelete(text, models).length > 0;
    }
    console.log(`${hit ? '✔' : '✘'} ${c}: ${j.mechanical.lint} lint ${hit ? 'flags it' : 'MISSED it'}`);
    if (!hit) bad++;
  }
  process.exit(bad ? 1 : 0);
} else if (cmd === 'apply') {
  need();
  const wt = resolve(repo, '..', `cb-eval-${id}`);
  if (existsSync(wt)) { console.error(`${wt} already exists. Run: node scripts/agent/eval.mjs clean ${id}`); process.exit(2); }
  git(repo, ['worktree', 'add', '-b', `eval/${id}`, wt, 'main']);
  const root = join(casesDir, id, 'files');
  for (const f of walk(root)) { const dest = join(wt, relative(root, f)); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(f, dest); }
  git(wt, ['add', '-A']);
  git(wt, ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '-q', '-m', `eval case ${id}: planted change`]);
  console.log(`Planted change committed in ${wt} (branch eval/${id}).\nGive the reviewer: git -C "${wt}" diff main...HEAD  and the roles: ${load(id).roles.join(', ')}.\nDo NOT tell the reviewer what is planted. Save its output, then: node scripts/agent/eval.mjs grade ${id} <file>`);
} else if (cmd === 'grade') {
  need();
  if (!file || !existsSync(file)) { console.error('Usage: eval.mjs grade <id> <reviewer-output-file>'); process.exit(2); }
  const j = load(id);
  const r = grade(j.expect, readFileSync(file, 'utf8'));
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${id} (verdict: ${r.verdict ?? 'not found'}, ${r.findings.length} finding(s))`);
  for (const c of r.checks) console.log(`  ${c.pass ? '✔' : '✘'} ${c.name}: ${c.detail}`);
  process.exit(r.pass ? 0 : 1);
} else if (cmd === 'clean') {
  need();
  const wt = resolve(repo, '..', `cb-eval-${id}`);
  if (existsSync(wt)) git(repo, ['worktree', 'remove', '--force', wt]);
  try { git(repo, ['branch', '-D', `eval/${id}`]); } catch { /* already gone */ }
  console.log(`Removed ${wt} and branch eval/${id}.`);
} else {
  console.error('Usage: eval.mjs list | check | apply <id> | grade <id> <file> | clean <id>'); process.exit(2);
}
