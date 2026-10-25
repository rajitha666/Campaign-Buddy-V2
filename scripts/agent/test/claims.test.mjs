import test from 'node:test';
import assert from 'node:assert/strict';
import { headingRows, parseLedger, mergeLedger, renderLedger, replaceLedger, START, END } from '../lib/claims.mjs';

const HTML = '<h1>Brief</h1>\n<h2>What it replaces</h2>\n<p>x</p>\n<h3>The two products</h3>\n<h4>deep</h4>\n<h2>Pricing</h2>\n';

test('headingRows seeds h2/h3 sections with stable ids and line ranges', () => {
  const rows = headingRows('brief', 'marketing/capability-brief.html', HTML, 'html');
  assert.deepEqual(rows.map((r) => r.id), ['brief:what-it-replaces', 'brief:the-two-products', 'brief:pricing']);
  assert.equal(rows[0].where, 'marketing/capability-brief.html:2-5');
  assert.ok(rows.every((r) => r.status === 'unverified'));
});

test('duplicate headings get distinct ids', () => {
  const rows = headingRows('landing', 'f.html', ['<h2>Ask anything</h2>', '<h2>Ask anything</h2>'].join('\n'), 'html');
  assert.deepEqual(rows.map((r) => r.id), ['landing:ask-anything', 'landing:ask-anything-2']);
});

test('merge keeps recorded status/evidence, adds new rows, flags vanished ones', () => {
  const existing = [
    { id: 'brief:pricing', topic: 'Pricing', where: 'old:1-2', status: 'verified', evidence: 'license-usage-spec', checked: '2026-10-25' },
    { id: 'brief:gone', topic: 'Gone', where: 'x', status: 'unverified', evidence: '', checked: '' },
  ];
  const fresh = headingRows('brief', 'm.html', '<h2>Pricing</h2>\n<h2>New thing</h2>\n', 'html');
  const m = mergeLedger(existing, fresh);
  const pricing = m.rows.find((r) => r.id === 'brief:pricing');
  assert.equal(pricing.status, 'verified'); assert.equal(pricing.evidence, 'license-usage-spec'); assert.equal(pricing.where, 'm.html:1-1');
  assert.deepEqual(m.added, ['brief:new-thing']);
  assert.deepEqual(m.gone, ['brief:gone']);
  assert.equal(m.rows.find((r) => r.id === 'brief:gone').status, 'retired?');
});

test('render/parse round-trip and replaceLedger keeps the text around the table', () => {
  const rows = [{ id: 'a:b', topic: 'T | with pipe', where: 'f:1-2', status: 'unverified', evidence: '', checked: '' }];
  const md = `# Title\n\nrules here\n\n${renderLedger(rows)}\n\nfooter\n`;
  assert.equal(parseLedger(md)[0].topic, 'T / with pipe');
  const rewritten = replaceLedger(md, [...rows, { id: 'c:d', topic: 'X', where: 'g:1-1', status: 'verified', evidence: 'e', checked: 'd' }]);
  assert.ok(rewritten.startsWith('# Title\n\nrules here') && rewritten.trimEnd().endsWith('footer'));
  assert.equal(parseLedger(rewritten).length, 2);
  assert.ok(rewritten.includes(START) && rewritten.includes(END));
});
