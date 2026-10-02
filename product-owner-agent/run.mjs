import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

import { makeGitHub } from './lib/github.mjs';
import { makeClaude } from './lib/claude.mjs';
import {
  REVIEW_MARKER,
  OVERRIDE_LABEL,
  formatReview,
  parseReviewKey,
  activeOverrideBy,
  buildDiffText,
} from './lib/review.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { GITHUB_TOKEN, GITHUB_REPO, ANTHROPIC_API_KEY, DRY_RUN, EVENT_NAME, GITHUB_EVENT_PATH, OVERRIDE_USERS, INPUT_NUMBER, DOCS_DIR } =
  process.env;

if (!GITHUB_TOKEN || !GITHUB_REPO || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars: GITHUB_TOKEN, GITHUB_REPO, ANTHROPIC_API_KEY');
  process.exit(1);
}

const dryRun = String(DRY_RUN).toLowerCase() === 'true';
const [owner, repo] = GITHUB_REPO.split('/');
const allowedUsers = (OVERRIDE_USERS || owner).split(',').map((s) => s.trim()).filter(Boolean);

const L = {
  endorsed: 'po:endorsed',
  objection: 'po:objection',
  decision: 'po:decision',
  override: OVERRIDE_LABEL,
  readyForReview: 'triage:ready-for-review',
};
const TRIAGE_SUMMARY_PREFIX = '**🤖 Triage bot — ready for review**';
// Meta-docs about the agents themselves add tokens but no product knowledge.
const SKIP_DOCS = new Set(['product-charter.md', 'product-owner-agent.md', 'triage-agent-spec.md', 'mcp-sync-agent.md']);

const github = makeGitHub({ token: GITHUB_TOKEN, owner, repo });

function loadContext() {
  // Read from the default-branch checkout, so a PR can't rewrite its own judge.
  const docsDir = DOCS_DIR || join(__dirname, '..', 'docs');
  const charter = readFileSync(join(docsDir, 'product-charter.md'), 'utf8');
  const rest = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && !SKIP_DOCS.has(d.name))
    .map((d) => `# ${d.name}\n\n${readFileSync(join(docsDir, d.name), 'utf8')}`);
  return [`# product-charter.md\n\n${charter}`, ...rest].join('\n\n---\n\n');
}

const claude = makeClaude({ apiKey: ANTHROPIC_API_KEY, contextBundle: loadContext() });
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const isReview = (c) => (c.body ?? '').includes(REVIEW_MARKER);
const labelsOf = (item) => item.labels.map((l) => (typeof l === 'string' ? l : l.name));

async function write(fn, describe) {
  if (dryRun) return console.log(`[dry-run] ${describe}`);
  return fn();
}

async function precedentText() {
  const decisions = await github.listIssuesByLabel(L.decision, 'all');
  return decisions
    .slice(0, 15)
    .map((d) => `## ${d.title}\n${(d.body ?? '').replace(/<!--[\s\S]*?-->/g, '').slice(0, 1200)}`)
    .join('\n\n');
}

// Records that the owner overrode the agent, once per subject. Keeps the
// objection in front of the owner as a follow-up so the gap isn't forgotten.
async function recordOverride({ kind, number, title, by, reviewBody }) {
  const ref = `${kind}-${number}`;
  const existing = (await github.listIssuesByLabel(L.decision, 'all')).find((d) => (d.body ?? '').includes(`<!-- po-decision ref=${ref} -->`));
  if (existing) return;
  const body = [
    `<!-- po-decision ref=${ref} -->`,
    `**Owner override** by @${by} on ${kind === 'pr' ? 'PR' : 'issue'} #${number} — ${title}`,
    '',
    reviewBody
      ? `The Product Owner agent's review at the time:\n\n${reviewBody.replace(/<!--[\s\S]*?-->/g, '').trim()}`
      : '_The change was overridden before the Product Owner agent reviewed it._',
    '',
    '## Follow-up owed',
    '- [ ] Close the gap the objection describes (or record here that it is accepted, with a reason).',
    '',
    '_This issue is read by the Product Owner agent as precedent. Add a one-line reason as a comment if you want it remembered._',
  ].join('\n');
  console.log(`  recording override decision for ${ref}`);
  await write(
    async () => {
      const created = await github.createIssue({ title: `[infra] PO override: ${title}`.slice(0, 200), body, labels: [L.decision] });
      await github.postComment(number, `🧭 Override recorded by @${by}. Follow-up: #${created.number}`);
    },
    `create ${L.decision} issue for ${ref}`
  );
}

async function upsertReviewComment(number, comments, body) {
  const mine = [...comments].reverse().find(isReview);
  if (mine) return github.updateComment(mine.id, body);
  return github.postComment(number, body);
}

async function reviewPR(number, { force = false } = {}) {
  const pr = await github.getPR(number);
  if (pr.state !== 'open' || pr.draft) return console.log(`PR #${number}: closed or draft — skipped`);
  const sha = pr.head.sha;

  const [events, comments] = await Promise.all([github.listIssueEvents(number), github.listComments(number)]);
  const overriddenBy = activeOverrideBy(events, allowedUsers);
  const existing = [...comments].reverse().find(isReview);

  if (overriddenBy) {
    console.log(`PR #${number}: override by ${overriddenBy}`);
    await write(() => github.setStatus(sha, 'success', `Owner override by @${overriddenBy}`), 'status success (override)');
    await recordOverride({ kind: 'pr', number, title: pr.title, by: overriddenBy, reviewBody: existing?.body });
    return;
  }

  if (!force && existing && parseReviewKey(existing.body) === sha) {
    console.log(`PR #${number}: already reviewed at ${sha.slice(0, 7)} — skipped`);
    return;
  }

  await write(() => github.setStatus(sha, 'pending', 'Product Owner review in progress'), 'status pending');
  try {
    const files = await github.listPRFiles(number);
    const { text: diffText } = buildDiffText(files);
    const linked = await linkedIssues(pr.body);
    const subjectText = [
      `# Pull request #${number}: ${pr.title}`,
      `Opened by ${pr.user?.login}. Base: ${pr.base.ref}. Changed files: ${files.length}.`,
      `\n## Description\n${pr.body || '(no description)'}`,
      linked ? `\n## Linked issues\n${linked}` : '',
      `\n## Changed files\n${files.map((f) => f.filename).join('\n')}`,
      `\n## Diff\n${diffText}`,
    ].join('\n');

    const verdict = await claude.review({ subjectText, precedent: await precedentText() });
    const body = formatReview({ subject: 'pull request', verdict, key: sha });
    await write(() => upsertReviewComment(number, comments, body), 'post/update review comment');

    const link = existing ? existing.html_url : undefined;
    if (verdict.verdict === 'block') {
      await write(() => github.setStatus(sha, 'failure', `Blocked: ${verdict.tldr}`, link), 'status failure');
    } else {
      await write(() => github.setStatus(sha, 'success', `${verdict.verdict === 'concerns' ? 'Endorsed with concerns' : 'Endorsed'}: ${verdict.tldr}`, link), 'status success');
    }
    console.log(`PR #${number}: ${verdict.verdict}`);
  } catch (err) {
    // Fail closed, but the owner can always add the override label.
    await write(() => github.setStatus(sha, 'error', 'Review failed — owner can add the po-override label to proceed'), 'status error');
    throw err;
  }
}

async function linkedIssues(text) {
  const nums = [...new Set([...(text ?? '').matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|see)\s+#(\d+)/gi)].map((m) => Number(m[1])))].slice(0, 3);
  const parts = [];
  for (const n of nums) {
    try {
      const i = await github.getIssue(n);
      parts.push(`### #${n}: ${i.title}\n${(i.body ?? '').slice(0, 2500)}`);
    } catch {
      /* not an issue we can read — ignore */
    }
  }
  return parts.join('\n\n');
}

async function reviewIssue(number, { force = false } = {}) {
  const issue = await github.getIssue(number);
  if (issue.pull_request || issue.state !== 'open') return console.log(`Issue #${number}: PR or closed — skipped`);
  const labels = labelsOf(issue);

  const [events, comments] = await Promise.all([github.listIssueEvents(number), github.listComments(number)]);
  const overriddenBy = activeOverrideBy(events, allowedUsers);
  const existing = [...comments].reverse().find(isReview);

  if (overriddenBy) {
    console.log(`Issue #${number}: override by ${overriddenBy}`);
    await recordOverride({ kind: 'issue', number, title: issue.title, by: overriddenBy, reviewBody: existing?.body });
    return;
  }

  if (!force && !labels.includes(L.readyForReview)) return console.log(`Issue #${number}: not ready-for-review — skipped`);

  const latest = [...comments].reverse().find((c) => !isReview(c));
  const key = hash(`${issue.updated_at ?? ''}|${latest?.id ?? 'none'}|${issue.title}|${issue.body ?? ''}`);
  if (!force && existing && parseReviewKey(existing.body) === key) return console.log(`Issue #${number}: already reviewed — skipped`);

  const thread = comments.filter((c) => !isReview(c)).map((c) => `${c.user?.login} (${c.created_at}):\n${c.body}`).join('\n\n');
  const subjectText = `# Issue #${number}: ${issue.title}\nOpened by ${issue.user?.login}.\n\n${issue.body || '(no description)'}\n\n## Thread (includes the triage bot's summary)\n\n${thread || '(no comments)'}`;

  const verdict = await claude.review({ subjectText, precedent: await precedentText() });
  const body = formatReview({ subject: 'issue', verdict, key });
  await write(async () => {
    await upsertReviewComment(number, comments, body);
    await github.removeLabel(number, L.endorsed);
    await github.removeLabel(number, L.objection);
    await github.addLabels(number, [verdict.verdict === 'block' ? L.objection : L.endorsed]);
  }, `post review + label (${verdict.verdict})`);
  console.log(`Issue #${number}: ${verdict.verdict}`);
}

async function ensureLabels() {
  await github.ensureLabel(L.endorsed, '0e8a16', 'Product Owner agent endorsed this');
  await github.ensureLabel(L.objection, 'b60205', 'Product Owner agent objected — see its comment');
  await github.ensureLabel(L.override, 'fbca04', 'Owner overrides the Product Owner agent (owner only)');
  await github.ensureLabel(L.decision, '5319e7', 'Recorded owner decision / override follow-up');
}

// Decide what to review from the triggering event.
async function targetsFromEvent() {
  const ev = GITHUB_EVENT_PATH ? JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')) : {};
  const commentIsRecheck = (b) => /^\s*\/po\b/i.test(b ?? '');

  switch (EVENT_NAME) {
    case 'pull_request':
    case 'pull_request_target':
      return [{ kind: 'pr', number: ev.pull_request.number }];
    case 'issues': {
      const name = ev.label?.name;
      if (ev.action === 'labeled' && (name === L.readyForReview || name === L.override)) return [{ kind: 'issue', number: ev.issue.number }];
      return [];
    }
    case 'issue_comment': {
      if (ev.action !== 'created') return [];
      const number = ev.issue.number;
      const body = ev.comment.body ?? '';
      const isPR = Boolean(ev.issue.pull_request);
      if (commentIsRecheck(body) && allowedUsers.includes(ev.comment.user?.login)) return [{ kind: isPR ? 'pr' : 'issue', number, force: true }];
      if (!isPR && body.startsWith(TRIAGE_SUMMARY_PREFIX)) return [{ kind: 'issue', number }];
      if (!isPR && labelsOf(ev.issue).includes(L.objection) && allowedUsers.includes(ev.comment.user?.login) && !isReview(ev.comment)) {
        return [{ kind: 'issue', number, force: true }]; // owner replied to an objection — look again
      }
      return [];
    }
    case 'workflow_dispatch':
      if (INPUT_NUMBER) {
        const item = await github.getIssue(Number(INPUT_NUMBER));
        return [{ kind: item.pull_request ? 'pr' : 'issue', number: item.number, force: true }];
      }
    // fall through to a full sweep
    case 'schedule': {
      const prs = (await github.listOpenPRs()).map((p) => ({ kind: 'pr', number: p.number }));
      const issues = (await github.listIssuesByLabel(L.readyForReview)).map((i) => ({ kind: 'issue', number: i.number }));
      return [...prs, ...issues];
    }
    default:
      console.log(`Event "${EVENT_NAME}" is not handled`);
      return [];
  }
}

async function main() {
  console.log(`Product Owner agent — ${owner}/${repo}, event=${EVENT_NAME}${dryRun ? ' [DRY RUN]' : ''}`);
  if (!dryRun) await ensureLabels();

  const targets = await targetsFromEvent();
  let errors = 0;
  for (const t of targets) {
    try {
      await (t.kind === 'pr' ? reviewPR : reviewIssue)(t.number, { force: t.force });
    } catch (err) {
      errors += 1;
      console.error(`${t.kind} #${t.number}: ERROR — ${err.message}`);
    }
  }
  console.log(`Done: ${targets.length} target(s), ${errors} error(s)`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
