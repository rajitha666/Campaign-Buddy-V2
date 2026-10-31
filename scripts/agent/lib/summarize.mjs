// Turn noisy test/build output into a few lines. Pure; quiet-run.mjs does the spawning.
const ANSI = /\u001B\[[0-9;?]*[A-Za-z]/g;
export const stripAnsi = (s) => s.replace(ANSI, '');

export function summarize(raw, exitCode, { maxFailures = 15 } = {}) {
  const out = stripAnsi(raw).replace(/\r/g, '');
  const lines = out.split('\n');
  const find = (re) => { for (let i = lines.length - 1; i >= 0; i--) { const m = lines[i].match(re); if (m) return m; } return null; };
  const facts = [];

  const vFiles = find(/Test Files\s+(.+)/); const vTests = find(/^\s*Tests\s+(.+)/);
  if (vFiles) facts.push(`vitest files: ${vFiles[1].trim()}`);
  if (vTests) facts.push(`vitest tests: ${vTests[1].trim()}`);

  const pwPass = find(/^\s*(\d+) passed/); const pwFail = find(/^\s*(\d+) failed/); const pwSkip = find(/^\s*(\d+) skipped/); const pwFlaky = find(/^\s*(\d+) flaky/);
  if (!vTests && (pwPass || pwFail)) {
    facts.push(`playwright: ${[pwPass && `${pwPass[1]} passed`, pwFail && `${pwFail[1]} failed`, pwFlaky && `${pwFlaky[1]} flaky`, pwSkip && `${pwSkip[1]} skipped`].filter(Boolean).join(', ')}`);
  }
  const tscErrs = lines.filter((l) => /error TS\d+:/.test(l));
  if (tscErrs.length) facts.push(`tsc: ${tscErrs.length} error(s)`);
  const built = find(/built in ([\d.]+m?s)/); if (built) facts.push(`build: built in ${built[1]}`);
  const nodeTest = find(/^# (pass|fail) (\d+)/); const nodePass = find(/^# pass (\d+)/); const nodeFail = find(/^# fail (\d+)/);
  if (nodeTest && nodePass) facts.push(`node:test: ${nodePass[1]} pass, ${nodeFail ? nodeFail[1] : 0} fail`);

  const failLines = [];
  const seen = new Set();
  // Playwright's closing "N failed" block lists each failed test as "[chromium] › file:line › title"
  const failedAt = pwFail ? lines.findIndex((l) => /^\s*\d+ failed/.test(l)) : -1;
  lines.forEach((l, idx) => {
    if (failedAt >= 0 && idx > failedAt && /^\s*\[(chromium|firefox|webkit)\]\s+›/.test(l)) {
      const k = l.trim().slice(0, 160);
      if (!seen.has(k)) { seen.add(k); failLines.push(k); }
    }
  });
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (/(^|\s)(FAIL|✗|×|✘)\s/.test(l) || /^\s*\d+\)\s+\[/.test(l) || /AssertionError|Error:\s/.test(t) && !/^at /.test(t) || /error TS\d+:/.test(t) || /^not ok /.test(t)) {
      const k = t.slice(0, 160);
      if (!seen.has(k)) { seen.add(k); failLines.push(k); }
    }
  }
  const ok = exitCode === 0;
  return { ok, facts, failures: failLines.slice(0, maxFailures), moreFailures: Math.max(0, failLines.length - maxFailures), tail: lines.filter((l) => l.trim()).slice(-8) };
}

export function formatSummary(cmdLabel, s, { seconds, logFile }) {
  const out = [`${s.ok ? '✔ PASS' : '✘ FAIL'}  ${cmdLabel}  (${seconds.toFixed(1)}s)`];
  s.facts.forEach((f) => out.push(`  ${f}`));
  if (!s.ok) {
    if (s.failures.length) { out.push('  failures:'); s.failures.forEach((f) => out.push(`    ${f}`)); if (s.moreFailures) out.push(`    … +${s.moreFailures} more`); }
    else { out.push('  last output:'); s.tail.forEach((f) => out.push(`    ${f.slice(0, 160)}`)); }
  } else if (!s.facts.length) out.push('  (no recognised test summary; command exited 0)');
  if (logFile) out.push(`  full log: ${logFile}`);
  return out.join('\n');
}
