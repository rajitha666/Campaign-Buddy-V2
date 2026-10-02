import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateVerdict,
  formatReview,
  parseReviewKey,
  activeOverrideBy,
  buildDiffText,
  REVIEW_MARKER,
} from '../lib/review.mjs';

const option = (over = {}) => ({
  name: 'Scope the query by agency',
  how: 'Add agencyId to the where clause and a test.',
  effort: 'small',
  delivers_outcome: 'Same report, safely.',
  recommended: true,
  ...over,
});

const blockingFinding = (over = {}) => ({
  id: 'F1',
  title: 'Report query has no tenant scope',
  category: 'tenant_isolation',
  blocking: true,
  impact: { who: 'Every agency', what: 'Sees other agencies\' sales', scale: 'All reports' },
  principle: '4.1-2 Strict tenant data isolation',
  evidence: ['campaign-buddy-backend/src/modules/admin/reports.routes.ts:40'],
  ...over,
});

const blockVerdict = (over = {}) => ({
  verdict: 'block',
  tldr: 'Scope the report by agency before shipping.',
  findings: [blockingFinding()],
  underlying_need: 'Brand managers want one cross-campaign view.',
  recommendation: { summary: 'Add scope, then ship.', options: [option()] },
  if_urgent: 'Override now; a follow-up adds the scope.',
  ...over,
});

test('validateVerdict accepts a well-formed block', () => {
  assert.equal(validateVerdict(blockVerdict()).verdict, 'block');
});

test('validateVerdict rejects a block that has no blocking finding', () => {
  const v = blockVerdict({ findings: [blockingFinding({ blocking: false })] });
  assert.throws(() => validateVerdict(v), /block/i);
});

test('validateVerdict rejects blocking on an advisory-only category', () => {
  const v = blockVerdict({ findings: [blockingFinding({ category: 'cost' })] });
  assert.throws(() => validateVerdict(v), /category/i);
});

test('validateVerdict rejects a block with no underlying need or recommended option', () => {
  assert.throws(() => validateVerdict(blockVerdict({ underlying_need: '' })), /underlying_need/);
  const noRec = blockVerdict({ recommendation: { summary: 's', options: [option({ recommended: false })] } });
  assert.throws(() => validateVerdict(noRec), /recommended/);
});

test('validateVerdict rejects endorse when a finding is blocking', () => {
  assert.throws(() => validateVerdict(blockVerdict({ verdict: 'endorse' })), /blocking/i);
});

test('validateVerdict accepts a plain endorse with no findings', () => {
  const v = validateVerdict({ verdict: 'endorse', tldr: 'Fits the charter.', findings: [] });
  assert.equal(v.verdict, 'endorse');
});

test('formatReview leads with the verdict and TL;DR and embeds the key marker', () => {
  const md = formatReview({ subject: 'pull request', verdict: blockVerdict(), key: 'abc123' });
  assert.match(md, /Blocked/);
  assert.match(md, /TL;DR/);
  assert.ok(md.includes(REVIEW_MARKER));
  assert.equal(parseReviewKey(md), 'abc123');
  assert.match(md, /po-override/);
  assert.match(md, /tenant_isolation/);
});

test('formatReview for an endorse stays short and has no override instructions', () => {
  const md = formatReview({
    subject: 'issue',
    verdict: { verdict: 'endorse', tldr: 'Fits the charter.', findings: [] },
    key: 'k',
  });
  assert.match(md, /Endorsed/);
  assert.doesNotMatch(md, /po-override/);
});

test('parseReviewKey returns null for unrelated comments', () => {
  assert.equal(parseReviewKey('hello'), null);
});

const ev = (event, name, login) => ({ event, label: { name }, actor: { login } });

test('activeOverrideBy returns the owner who applied the label', () => {
  const events = [ev('labeled', 'po-override', 'rajitha666')];
  assert.equal(activeOverrideBy(events, ['rajitha666']), 'rajitha666');
});

test('activeOverrideBy ignores a non-owner, a bot, and a removed label', () => {
  assert.equal(activeOverrideBy([ev('labeled', 'po-override', 'someone')], ['rajitha666']), null);
  assert.equal(activeOverrideBy([ev('labeled', 'po-override', 'github-actions[bot]')], ['rajitha666']), null);
  const removed = [ev('labeled', 'po-override', 'rajitha666'), ev('unlabeled', 'po-override', 'rajitha666')];
  assert.equal(activeOverrideBy(removed, ['rajitha666']), null);
});

test('buildDiffText caps total size and says so', () => {
  const files = Array.from({ length: 5 }, (_, i) => ({
    filename: `f${i}.ts`,
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: 'x'.repeat(600),
  }));
  const { text, truncated } = buildDiffText(files, { totalCap: 1500, perFileCap: 500 });
  assert.equal(truncated, true);
  assert.match(text, /truncated/i);
  assert.ok(text.length < 2500);
});
