#!/usr/bin/env node
// Stand up (or tear down) an isolated, freshly seeded stack for verification: test database reset + seeded,
// backend on :4300, portal dev server on :5173 proxied to it. Never touches a dev database.
//
//   node scripts/agent/fresh-stack.mjs up        # reset+seed test DB, start backend + portal, wait until ready
//   node scripts/agent/fresh-stack.mjs status
//   node scripts/agent/fresh-stack.mjs down
//   options: --root <repo or worktree>  --backend-port 4300  --portal-port 5173
//
// SAFETY: refuses to run unless DATABASE_URL in campaign-buddy-backend/.env.test names a database ending in "_test".
// Logins are in prisma/seed.ts and prisma/demo-seed.ts (not printed here).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const root = resolve(opt('--root', process.cwd()));
const BP = Number(opt('--backend-port', 4300));
const PP = Number(opt('--portal-port', 5173));
const backend = join(root, 'campaign-buddy-backend');
const portal = join(root, 'campaign-buddy-portal');
const stateFile = join(tmpdir(), 'campaign-buddy-stack.json');
const logDir = join(tmpdir(), 'campaign-buddy-agent-logs'); mkdirSync(logDir, { recursive: true });
process.noDeprecation = true;
const isWin = process.platform === 'win32';

const readState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } };
const say = (m) => console.log(m);
const die = (m, c = 1) => { console.error(m); process.exit(c); };

function testDbUrl() {
  const p = join(backend, '.env.test');
  if (!existsSync(p)) die(`Missing ${p} — copy .env.test.example and point it at a *_test database.`);
  const line = readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) die('DATABASE_URL not found in .env.test');
  const url = line.replace(/^\s*DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '');
  const db = (url.split('?')[0].split('/').pop() || '');
  if (!/_test$/.test(db)) die(`REFUSING: database "${db}" does not end in _test. fresh-stack only resets isolated test databases.`);
  return { url, db };
}

const portOpen = (port) => new Promise((res) => { const s = net.createConnection({ port, host: 'localhost' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); s.setTimeout(800, () => { s.destroy(); res(false); }); });
async function waitHttp(url, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await fetch(url, { signal: AbortSignal.timeout(2500) }); return true; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
  return false;
}
function run(label, args, cwd, env) {
  const r = spawnSync(args[0], args.slice(1), { cwd, env: { ...process.env, ...env }, shell: isWin, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) die(`✘ ${label} failed (exit ${r.status}):\n${(r.stdout || '').split('\n').slice(-8).join('\n')}\n${(r.stderr || '').split('\n').slice(-8).join('\n')}`);
  say(`✔ ${label}`);
}
function start(name, args, cwd, env) {
  const log = join(logDir, `stack-${name}.log`); const fd = openSync(log, 'w');
  const c = spawn(args[0], args.slice(1), { cwd, env: { ...process.env, ...env }, shell: isWin, detached: true, stdio: ['ignore', fd, fd] });
  c.unref(); return { pid: c.pid, log };
}
function kill(pid) {
  try { if (isWin) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
}

async function up() {
  const cur = readState();
  if (cur && (await portOpen(cur.backendPort)) && (await portOpen(cur.portalPort))) { say(`Already up: backend http://localhost:${cur.backendPort}  portal http://localhost:${cur.portalPort}`); return; }
  if (await portOpen(BP)) die(`Port ${BP} is already in use (not by fresh-stack). Stop it or pass --backend-port.`);
  if (await portOpen(PP)) die(`Port ${PP} is already in use (not by fresh-stack). Stop it or pass --portal-port.`);
  const { url, db } = testDbUrl();
  const env = { DATABASE_URL: url };
  say(`Resetting and seeding isolated database "${db}" …`);
  run('prisma migrate reset', ['npx', 'prisma', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed'], backend, env);
  run('base seed', ['npx', 'ts-node', 'prisma/seed.ts'], backend, env);
  run('demo seed', ['npx', 'ts-node', 'prisma/demo-seed.ts'], backend, env);
  const b = start('backend', ['npx', 'ts-node', 'src/server.ts'], backend, { ...env, PORT: String(BP) });
  const p = start('portal', ['npx', 'vite', '--port', String(PP), '--strictPort'], portal, { VITE_API_PROXY_TARGET: `http://localhost:${BP}` });
  writeFileSync(stateFile, JSON.stringify({ backendPid: b.pid, portalPid: p.pid, backendPort: BP, portalPort: PP, db, startedAt: new Date().toISOString(), logs: { backend: b.log, portal: p.log } }));
  const okB = await waitHttp(`http://localhost:${BP}/`); const okP = await waitHttp(`http://localhost:${PP}/`);
  if (!okB || !okP) { kill(b.pid); kill(p.pid); rmSync(stateFile, { force: true }); die(`✘ stack did not become ready (backend ${okB ? 'ok' : 'DOWN'}, portal ${okP ? 'ok' : 'DOWN'}). Logs: ${b.log} / ${p.log}`); }
  say(`✔ Stack ready — backend http://localhost:${BP}  portal http://localhost:${PP}  (db ${db})`);
  say('  Run e2e with:  cd campaign-buddy-portal && npx playwright test   (baseURL defaults to :5173)');
  say('  Stop with:     node scripts/agent/fresh-stack.mjs down');
}

async function down() {
  const s = readState();
  if (!s) { say('Nothing recorded as running.'); return; }
  kill(s.backendPid); kill(s.portalPid);
  rmSync(stateFile, { force: true });
  say(`Stopped backend (:${s.backendPort}) and portal (:${s.portalPort}).`);
}

async function status() {
  const s = readState();
  if (!s) { say('down (no stack recorded)'); return; }
  say(`recorded ${s.startedAt}: backend :${s.backendPort} ${(await portOpen(s.backendPort)) ? 'UP' : 'down'}, portal :${s.portalPort} ${(await portOpen(s.portalPort)) ? 'UP' : 'down'}, db ${s.db}`);
}

({ up, down, status }[cmd] || (() => die('usage: fresh-stack.mjs up|down|status [--root dir]', 2)))();
