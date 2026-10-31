import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseVerdict, parseFindings, grade } from '../lib/evals.mjs';

const GOOD = `**Changes required** — the route leaks staff secrets.

- [security_privacy · suggest-block] Whole Staff row returned
  Evidence: staffCard.routes.ts:14
  Required change: select only name and phone   Effort: S
- [maintainability · advise] No test
`;

test('parseVerdict reads the leading verdict, longest phrase first', () => {
  assert.equal(parseVerdict('**Endorsed with concerns** — fine'), 'Endorsed with concerns');
  assert.equal(parseVerdict('Endorsed. TL;DR clean'), 'Endorsed');
  assert.equal(parseVerdict('Not verified: tests were not run'), 'Not verified');
  assert.equal(parseVerdict('no verdict here'), null);
});

test('parseFindings reads category and severity, defaulting to advise', () => {
  const f = parseFindings(GOOD + '- [tests] bare category\n');
  assert.deepEqual(f.map((x) => `${x.category}:${x.severity}`), ['security_privacy:suggest-block', 'maintainability:advise', 'tests:advise']);
});

test('grade passes a reviewer that finds the planted blocker', () => {
  const r = grade({ verdict_in: ['Changes required'], categories_any: ['security_privacy', 'tenant_isolation'], suggest_block: true }, GOOD);
  assert.equal(r.pass, true);
});

test('grade fails a rubber-stamp on a planted defect', () => {
  const r = grade({ verdict_not: ['Endorsed'], categories_any: ['data_loss_offline'], suggest_block: true }, 'Endorsed — looks good, no findings.');
  assert.equal(r.pass, false);
  assert.equal(r.checks.filter((c) => !c.pass).length, 3);
});

test('grade fails a false block on the clean control', () => {
  const r = grade({ verdict_in: ['Endorsed', 'Endorsed with concerns'], suggest_block: false }, 'Endorsed with concerns\n- [architecture_risk · suggest-block] invented risk\n');
  assert.equal(r.pass, false);
  assert.ok(r.checks.some((c) => c.name === 'no false block' && !c.pass));
});

test('the mechanical lints still flag the cases that rely on them', () => {
  const r = spawnSync(process.execPath, [new URL('../eval.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /destructive-migration.*flags it/);
  assert.match(r.stdout, /soft-delete-leak.*flags it/);
});
