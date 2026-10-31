// Shared CLI plumbing: git range arguments and a git() helper.
//   (none)              main...HEAD
//   <base> <head>       base...head
//   --merge <sha>       an already-merged PR: sha^1..sha
//   --cwd <dir>         repo or worktree
import { execFileSync } from 'node:child_process';

export function parseRange(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const cwd = opt('--cwd') || process.cwd();
  const valueFlags = ['--merge', '--cwd', '--root', '--base', '--routes', '--widths', '--out', '--login', '--theme', '--max', '--mode'];
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valueFlags.includes(argv[i - 1]));
  let base; let head; let dots;
  if (opt('--merge')) { head = opt('--merge'); base = `${head}^1`; dots = '..'; }
  else { base = positional[0] || 'main'; head = positional[1] || 'HEAD'; dots = '...'; }
  return { cwd, base, head, spec: `${base}${dots}${head}`, positional };
}

export const gitIn = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
