// Pure logic for the reviewer eval set: parse a reviewer's verdict text and grade it against a case's expectations.
// No I/O — scripts/agent/eval.mjs reads files and git.

const VERDICTS = [
  'Endorsed with concerns', 'Changes required', 'Endorsed',
  'Not verified', 'Verified', 'No change needed', 'Updated', 'Missing',
];

/** First recognised verdict phrase in the text (longest first), or null. */
export function parseVerdict(text) {
  const head = String(text).replace(/[*_`#>]/g, '').slice(0, 400).toLowerCase();
  let best = null;
  for (const v of VERDICTS) {
    const i = head.indexOf(v.toLowerCase());
    if (i !== -1 && (best === null || i < best.i || (i === best.i && v.length > best.v.length))) best = { v, i };
  }
  return best ? best.v : null;
}

/** Findings in the roles.md contract: `- [category · advise|suggest-block] title`. */
export function parseFindings(text) {
  const out = [];
  for (const m of String(text).matchAll(/^\s*[-*]\s*\[\s*([a-z_]+)\s*(?:[·•|,-]\s*([a-z-]+))?\s*\]\s*(.*)$/gim)) {
    out.push({ category: m[1].toLowerCase(), severity: (m[2] || 'advise').toLowerCase(), title: m[3].trim() });
  }
  return out;
}

/**
 * Grade one reviewer output. expect = {
 *   verdict_in?: string[]      verdict must be one of these
 *   verdict_not?: string[]     verdict must not be any of these
 *   categories_any?: string[]  at least one finding must carry one of these categories
 *   suggest_block?: boolean    true: a suggest-block finding is required; false: none allowed
 * }
 * Returns { pass, checks: [{name, pass, detail}] }.
 */
export function grade(expect, text) {
  const verdict = parseVerdict(text);
  const findings = parseFindings(text);
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  if (expect.verdict_in) add('verdict allowed', !!verdict && expect.verdict_in.includes(verdict), `got ${verdict ?? 'none'}, want ${expect.verdict_in.join(' | ')}`);
  if (expect.verdict_not) add('verdict not rubber-stamp', !!verdict && !expect.verdict_not.includes(verdict), `got ${verdict ?? 'none'}, must not be ${expect.verdict_not.join(' | ')}`);
  if (expect.categories_any) {
    const hit = findings.filter((f) => expect.categories_any.includes(f.category));
    add('planted defect found', hit.length > 0, hit.length ? `found ${hit.map((f) => f.category).join(', ')}` : `no finding in ${expect.categories_any.join(' | ')}; saw ${findings.map((f) => f.category).join(', ') || 'no findings'}`);
  }
  if (expect.suggest_block === true) add('suggest-block raised', findings.some((f) => f.severity === 'suggest-block'), 'a planted blocker must be marked suggest-block');
  if (expect.suggest_block === false) add('no false block', !findings.some((f) => f.severity === 'suggest-block'), 'a clean change must not carry suggest-block');
  return { pass: checks.every((c) => c.pass), verdict, findings, checks };
}
