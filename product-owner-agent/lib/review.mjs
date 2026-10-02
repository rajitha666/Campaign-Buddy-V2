// Pure logic: verdict validation, comment formatting, override detection, diff
// packing. No network, so it is unit-tested in test/review.test.mjs.

export const REVIEW_MARKER = '<!-- po-agent:review';
export const OVERRIDE_LABEL = 'po-override';

// Keep in step with docs/product-charter.md §7.
export const BLOCK_CATEGORIES = [
  'tenant_isolation',
  'security_privacy',
  'data_loss_offline',
  'breaks_shipped_clients',
  'scope_creep',
];
export const ADVISE_CATEGORIES = ['scale', 'cost', 'locale_hardcoding', 'simplicity', 'missing_tests_or_guides', 'other'];
const ALL_CATEGORIES = [...BLOCK_CATEGORIES, ...ADVISE_CATEGORIES];
const VERDICTS = ['endorse', 'concerns', 'block'];

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

// Throws if the model's answer would produce an objection the owner can't act
// on. A malformed verdict must never turn into a green check.
export function validateVerdict(v) {
  if (!v || typeof v !== 'object') throw new Error('verdict is not an object');
  if (!VERDICTS.includes(v.verdict)) throw new Error(`unknown verdict ${JSON.stringify(v.verdict)}`);
  if (!nonEmpty(v.tldr)) throw new Error('tldr is required');
  const findings = Array.isArray(v.findings) ? v.findings : [];

  for (const f of findings) {
    if (!ALL_CATEGORIES.includes(f.category)) throw new Error(`unknown category ${JSON.stringify(f.category)}`);
    if (f.blocking && !BLOCK_CATEGORIES.includes(f.category)) {
      throw new Error(`category "${f.category}" is advisory-only and cannot be blocking`);
    }
    if (!nonEmpty(f.title)) throw new Error('every finding needs a title');
  }

  const hasBlocking = findings.some((f) => f.blocking);
  if (v.verdict === 'block' && !hasBlocking) throw new Error('verdict "block" needs at least one blocking finding');
  if (v.verdict !== 'block' && hasBlocking) throw new Error(`verdict "${v.verdict}" cannot carry a blocking finding`);

  if (v.verdict === 'block') {
    if (!nonEmpty(v.underlying_need)) throw new Error('block needs underlying_need');
    const options = v.recommendation?.options;
    if (!Array.isArray(options) || options.length === 0) throw new Error('block needs at least one option');
    if (options.filter((o) => o.recommended).length !== 1) throw new Error('block needs exactly one recommended option');
    if (!nonEmpty(v.if_urgent)) throw new Error('block needs if_urgent');
  }
  return v;
}

const HEADLINE = {
  endorse: '✅ Endorsed',
  concerns: '⚠️ Endorsed with concerns',
  block: '❌ Blocked',
};

function findingBlock(f) {
  const tag = f.blocking ? '🔴 **Blocks**' : '🟡 Advisory';
  const lines = [`**${f.id ? `${f.id} — ` : ''}${f.title}** · ${tag} · \`${f.category}\``];
  if (f.impact) {
    if (f.impact.who) lines.push(`- **Who is affected:** ${f.impact.who}`);
    if (f.impact.what) lines.push(`- **What goes wrong:** ${f.impact.what}`);
    if (f.impact.scale) lines.push(`- **How big:** ${f.impact.scale}`);
  }
  if (f.principle) lines.push(`- **Charter principle:** ${f.principle}`);
  if (Array.isArray(f.evidence) && f.evidence.length) lines.push(`- **Evidence:** ${f.evidence.join('; ')}`);
  return lines.join('\n');
}

export function formatReview({ subject, verdict, key }) {
  const v = verdict;
  const out = [`${REVIEW_MARKER} key=${key} -->`, `## 🧭 Product Owner review — ${HEADLINE[v.verdict]}`, '', `**TL;DR:** ${v.tldr}`];

  if (v.findings?.length) {
    out.push('', '### Impact', '', ...v.findings.map(findingBlock).flatMap((b) => [b, '']));
  }

  if (v.underlying_need) out.push('### The outcome we\'re actually after', '', v.underlying_need, '');

  if (v.recommendation?.options?.length) {
    out.push('### How to get there', '');
    if (v.recommendation.summary) out.push(v.recommendation.summary, '');
    out.push('| Option | How | Effort | Delivers |', '|---|---|---|---|');
    for (const o of v.recommendation.options) {
      const name = o.recommended ? `⭐ **${o.name}** (recommended)` : o.name;
      const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      out.push(`| ${cell(name)} | ${cell(o.how)} | ${cell(o.effort)} | ${cell(o.delivers_outcome)} |`);
    }
    out.push('');
  }

  if (Array.isArray(v.questions) && v.questions.length) {
    out.push('### Questions for the owner', '', ...v.questions.map((q, i) => `${i + 1}. ${q}`), '');
  }

  if (v.verdict === 'block') {
    out.push(
      '### Need this now?',
      '',
      `Add the \`${OVERRIDE_LABEL}\` label to this ${subject} — it goes through immediately and no reason is required. ` +
        `${v.if_urgent}`,
      '',
      '_Only the owner\'s override counts. It is logged as a `po:decision` follow-up issue so the gap is not forgotten._'
    );
  } else {
    out.push(`_Reply \`/po review\` to ask me to look again after changes._`);
  }
  return out.join('\n').trimEnd();
}

export function parseReviewKey(body) {
  const m = /<!-- po-agent:review key=(\S+) -->/.exec(body ?? '');
  return m ? m[1] : null;
}

// `events` = GET /issues/{n}/events. The override counts only if the *latest*
// labeled/unlabeled event for the label is a "labeled" by an allowed user.
export function activeOverrideBy(events, allowedUsers) {
  const relevant = events.filter((e) => e.label?.name === OVERRIDE_LABEL && (e.event === 'labeled' || e.event === 'unlabeled'));
  const last = relevant[relevant.length - 1];
  if (!last || last.event !== 'labeled') return null;
  const login = last.actor?.login;
  return login && allowedUsers.includes(login) ? login : null;
}

export function buildDiffText(files, { totalCap = 100_000, perFileCap = 8_000 } = {}) {
  let text = '';
  let truncated = false;
  for (const f of files) {
    const head = `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`;
    let patch = f.patch ?? '(no textual diff — binary or too large)';
    if (patch.length > perFileCap) {
      patch = `${patch.slice(0, perFileCap)}\n… [file diff truncated]`;
      truncated = true;
    }
    const chunk = `${head}${patch}\n\n`;
    if (text.length + chunk.length > totalCap) {
      truncated = true;
      text += `### ${f.filename} — omitted, total diff size cap reached\n\n`;
      continue;
    }
    text += chunk;
  }
  if (truncated) text += '[NOTE: diff truncated — review is based on a partial view of the change.]\n';
  return { text, truncated };
}
