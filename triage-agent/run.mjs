import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeGitHub } from './lib/github.mjs';
import { makeProjectSync } from './lib/project.mjs';
import { loadDocsBundle } from './lib/docs.mjs';
import { makeClaude } from './lib/claude.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { GITHUB_TOKEN, GITHUB_REPO, ANTHROPIC_API_KEY, PROJECT_NUMBER, DRY_RUN } = process.env;

if (!GITHUB_TOKEN || !GITHUB_REPO || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars: GITHUB_TOKEN, GITHUB_REPO, ANTHROPIC_API_KEY');
  process.exit(1);
}

const dryRun = String(DRY_RUN).toLowerCase() === 'true';
const [owner, repo] = GITHUB_REPO.split('/');

// Pipeline stages live entirely as GitHub labels — no separate database, so
// the state of every ticket is visible directly on the issue in GitHub.
const STAGE = {
  new: 'triage:new',
  needsInfo: 'triage:needs-info',
  readyForReview: 'triage:ready-for-review',
  inBuild: 'triage:in-build',
};
const APPROVAL_LABEL = 'approved-for-build';
const STAGE_LABEL_SET = new Set(Object.values(STAGE));
const PROJECT_STATUS = {
  [STAGE.new]: 'New',
  [STAGE.needsInfo]: 'Needs Info',
  [STAGE.readyForReview]: 'Ready for Review',
  [STAGE.inBuild]: 'In Build',
};
const COMPONENTS = ['backend', 'portal', 'app', 'docs', 'infra'];

function componentLabel(component) {
  return COMPONENTS.includes(component) ? `component:${component}` : null;
}

function formatQuestionsComment(result) {
  return [
    '**🤖 Triage bot — a few clarifying questions before this can be scoped:**',
    '',
    ...result.questions.map((q, i) => `${i + 1}. **${q.question}**\n   _Why I'm asking: ${q.why}_`),
    '',
    "_Reply in this thread and I'll pick it back up on the next triage pass._",
  ].join('\n');
}

function formatSummaryComment(result) {
  const s = result.summary;
  return [
    '**🤖 Triage bot — ready for review**',
    '',
    `**Business context:** ${s.business_context}`,
    s.root_cause ? `\n**Root cause:** ${s.root_cause}` : '',
    '\n**Proposed changes:**',
    s.proposed_changes.backend ? `- Backend: ${s.proposed_changes.backend}` : null,
    s.proposed_changes.portal ? `- Portal: ${s.proposed_changes.portal}` : null,
    s.proposed_changes.app ? `- Mobile app: ${s.proposed_changes.app}` : null,
    `\n**Effort estimate:** ${s.effort_estimate}`,
    `**Risks / assumptions:** ${s.risks_or_assumptions}`,
    '',
    `_To send this to build, add the \`${APPROVAL_LABEL}\` label._`,
  ]
    .filter((line) => line !== null && line !== '')
    .join('\n');
}

async function main() {
  const github = makeGitHub({ token: GITHUB_TOKEN, owner, repo });
  const me = await github.me();
  const botLogin = me.login;
  console.log(`Running as ${botLogin} against ${owner}/${repo}${dryRun ? ' [DRY RUN]' : ''}`);

  const docsBundle = loadDocsBundle(join(__dirname, '..', 'docs'));
  const claude = makeClaude({ apiKey: ANTHROPIC_API_KEY, docsBundle });
  const projectSync = makeProjectSync({
    github,
    owner,
    projectNumber: PROJECT_NUMBER ? Number(PROJECT_NUMBER) : null,
  });

  if (!dryRun) {
    await github.ensureLabel(STAGE.new, 'ededed', 'Triage: not yet reviewed');
    await github.ensureLabel(STAGE.needsInfo, 'fbca04', 'Triage: waiting on clarifying answers');
    await github.ensureLabel(STAGE.readyForReview, '0e8a16', 'Triage: summarized, awaiting human approval');
    await github.ensureLabel(STAGE.inBuild, '5319e7', 'Triage: approved, ready to build');
    await github.ensureLabel(APPROVAL_LABEL, '1d76db', 'Human approved this ticket for build');
    for (const c of COMPONENTS) {
      await github.ensureLabel(`component:${c}`, 'c5def5', `Affects the ${c} surface`);
    }
  }

  const issues = await github.listOpenIssues();
  const stats = { analyzed: 0, needsInfo: 0, ready: 0, movedToBuild: 0, skipped: 0, errors: 0 };

  for (const issue of issues) {
    try {
      const labelNames = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));
      const currentStage = Object.values(STAGE).find((s) => labelNames.includes(s)) || null;

      if (currentStage === STAGE.inBuild) {
        stats.skipped += 1;
        continue;
      }

      // Human approval is the one transition that needs no LLM call at all.
      if (labelNames.includes(APPROVAL_LABEL)) {
        console.log(`#${issue.number}: approval label detected -> moving to in-build`);
        stats.movedToBuild += 1;
        if (!dryRun) {
          const keep = labelNames.filter((l) => !STAGE_LABEL_SET.has(l));
          await github.setLabels(issue.number, [...keep, STAGE.inBuild]);
          await github.postComment(
            issue.number,
            '**🤖 Triage bot** — approved and moved to `triage:in-build`. Handing off for implementation.'
          );
          await projectSync.syncIssueStatus(issue.node_id, PROJECT_STATUS[STAGE.inBuild]);
        }
        continue;
      }

      const comments = await github.listComments(issue.number);
      const lastBotCommentAt = [...comments].reverse().find((c) => c.user?.login === botLogin)?.created_at;
      const hasNewHumanReply = lastBotCommentAt
        ? comments.some((c) => c.user?.login !== botLogin && new Date(c.created_at) > new Date(lastBotCommentAt))
        : true;

      const isWaitingStage = currentStage === STAGE.needsInfo || currentStage === STAGE.readyForReview;
      const shouldAnalyze = !currentStage || currentStage === STAGE.new || (isWaitingStage && hasNewHumanReply);

      if (!shouldAnalyze) {
        stats.skipped += 1;
        continue;
      }

      console.log(`#${issue.number}: analyzing ("${issue.title}")`);
      const result = await claude.triageIssue({ issue, comments });
      stats.analyzed += 1;

      const compLabel = componentLabel(result.component);
      const keepLabels = labelNames.filter((l) => !STAGE_LABEL_SET.has(l) && l !== APPROVAL_LABEL);

      if (result.status === 'needs_info') {
        stats.needsInfo += 1;
        const nextLabels = [...new Set([...keepLabels, STAGE.needsInfo, ...(compLabel ? [compLabel] : [])])];
        console.log(`  -> needs_info (${result.questions.length} question(s))`);
        if (!dryRun) {
          await github.postComment(issue.number, formatQuestionsComment(result));
          await github.setLabels(issue.number, nextLabels);
          await projectSync.syncIssueStatus(issue.node_id, PROJECT_STATUS[STAGE.needsInfo]);
        } else {
          console.log(formatQuestionsComment(result));
        }
      } else {
        stats.ready += 1;
        const nextLabels = [...new Set([...keepLabels, STAGE.readyForReview, ...(compLabel ? [compLabel] : [])])];
        console.log('  -> ready for review');
        if (!dryRun) {
          await github.postComment(issue.number, formatSummaryComment(result));
          await github.setLabels(issue.number, nextLabels);
          await projectSync.syncIssueStatus(issue.node_id, PROJECT_STATUS[STAGE.readyForReview]);
        } else {
          console.log(formatSummaryComment(result));
        }
      }
    } catch (err) {
      stats.errors += 1;
      console.error(`#${issue.number}: ERROR — ${err.message}`);
    }
  }

  console.log('\n--- Triage run summary ---');
  console.log(stats);
  if (stats.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
