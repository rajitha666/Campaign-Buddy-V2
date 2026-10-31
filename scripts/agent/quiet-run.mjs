#!/usr/bin/env node
// Run a command and print only a short summary (counts + first failures). Full output goes to a log file.
//   node scripts/agent/quiet-run.mjs --cwd campaign-buddy-portal -- npx vitest run
//   node scripts/agent/quiet-run.mjs --cwd campaign-buddy-app -- npx tsc --noEmit
// Exit code mirrors the command's.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize, formatSummary } from './lib/summarize.mjs';

process.noDeprecation = true; // Windows needs shell:true to run .cmd shims; its warning is noise here

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
if (dd < 0 || dd === argv.length - 1) { console.error('usage: quiet-run.mjs [--cwd dir] -- <command...>'); process.exit(2); }
const pre = argv.slice(0, dd); const cmd = argv.slice(dd + 1);
const cwdIdx = pre.indexOf('--cwd');
const cwd = cwdIdx >= 0 ? pre[cwdIdx + 1] : process.cwd();

const started = Date.now();
// With shell:true on Windows, args are concatenated unescaped — quote anything with spaces or quotes.
const winQuote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const isWin = process.platform === 'win32';
const child = spawn(isWin ? winQuote(cmd[0]) : cmd[0], (isWin ? cmd.slice(1).map(winQuote) : cmd.slice(1)), { cwd, shell: isWin, env: { ...process.env, CI: process.env.CI || '1', FORCE_COLOR: '0' } });
let buf = '';
child.stdout.on('data', (d) => { buf += d; });
child.stderr.on('data', (d) => { buf += d; });
child.on('error', (e) => { console.error(`could not run: ${e.message}`); process.exit(127); });
child.on('close', (code) => {
  const dir = join(tmpdir(), 'campaign-buddy-agent-logs'); mkdirSync(dir, { recursive: true });
  const logFile = join(dir, `run-${Date.now()}.log`); writeFileSync(logFile, buf);
  const s = summarize(buf, code ?? 1);
  console.log(formatSummary(`${cmd.join(' ')}${cwd !== process.cwd() ? `  [${cwd}]` : ''}`, s, { seconds: (Date.now() - started) / 1000, logFile: s.ok ? null : logFile }));
  process.exit(code ?? 1);
});
