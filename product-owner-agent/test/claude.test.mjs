import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt, extractResultText, parseVerdictJson } from '../lib/claude.mjs';

test('buildPrompt sections the charter, precedent and subject with separators', () => {
  const prompt = buildPrompt({ contextBundle: 'CHARTER', precedent: 'DECISIONS', subjectText: 'SUBJECT' });
  assert.match(prompt, /# Product Charter and documentation\n\nCHARTER/);
  assert.match(prompt, /# Recent owner decisions \(precedent\)\n\nDECISIONS/);
  assert.match(prompt, /SUBJECT/);
  assert.equal(prompt.split('\n\n---\n\n').length, 3);
});

test('buildPrompt defaults precedent to a plain note when empty', () => {
  const prompt = buildPrompt({ contextBundle: 'C', precedent: '', subjectText: 'S' });
  assert.match(prompt, /\(none yet\)/);
});

test('extractResultText reads the "result" field from the CLI\'s JSON wrapper', () => {
  const text = extractResultText(JSON.stringify({ result: '  {"verdict":"endorse"}  ', is_error: false }));
  assert.equal(text, '{"verdict":"endorse"}');
});

test('extractResultText throws on stdout that is not JSON', () => {
  assert.throws(() => extractResultText('not json'), /did not return valid JSON/);
});

test('extractResultText throws when the CLI reports an error', () => {
  assert.throws(() => extractResultText(JSON.stringify({ is_error: true, result: '' })), /reported an error/);
  assert.throws(
    () => extractResultText(JSON.stringify({ subtype: 'error_during_execution', result: '' })),
    /reported an error/
  );
});

test('extractResultText throws on an empty result', () => {
  assert.throws(() => extractResultText(JSON.stringify({ result: '   ' })), /no result text/);
});

test('parseVerdictJson strips markdown code fences before parsing', () => {
  const v = parseVerdictJson('```json\n{"verdict":"endorse","tldr":"fine","findings":[]}\n```');
  assert.equal(v.verdict, 'endorse');
});

test('parseVerdictJson parses a bare JSON object with no fences', () => {
  const v = parseVerdictJson('{"verdict":"block"}');
  assert.equal(v.verdict, 'block');
});
