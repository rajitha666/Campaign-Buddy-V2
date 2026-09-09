import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { issueReports } from '../lib/endpoints';
import { ApiError } from '../lib/apiClient';

const CATEGORIES = [
  ['bug', 'Bug'],
  ['enhancement', 'Enhancement'],
  ['question', 'Question'],
];
const SEVERITIES = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['high', 'High'],
  ['critical', 'Critical'],
];

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Files a bug / enhancement / question from inside the portal. The backend
// persists it and (when configured) opens a matching GitHub issue.
export default function ReportIssueModal({ open, onClose }) {
  const { user, persona, currentCampaign } = useAuth();
  const { push } = useToast();
  const location = useLocation();

  const [category, setCategory] = useState('bug');
  const [severity, setSeverity] = useState('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const context = useMemo(
    () => ({
      page: location.pathname,
      persona: persona || undefined,
      campaignName: currentCampaign?.name || undefined,
      portalVersion: APP_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }),
    [location.pathname, persona, currentCampaign],
  );

  function reset() {
    setCategory('bug');
    setSeverity('normal');
    setTitle('');
    setBody('');
    setErr(null);
    setSubmitting(false);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function submit() {
    setErr(null);
    if (title.trim().length < 4) return setErr('Give the issue a short title (at least 4 characters).');
    if (body.trim().length < 10) return setErr('Add a bit more detail (at least 10 characters).');

    setSubmitting(true);
    try {
      const res = await issueReports.create({
        title: title.trim(),
        body: body.trim(),
        category,
        ...(category === 'bug' ? { severity } : {}),
        context,
      });
      const row = res?.data;
      if (row?.githubIssueUrl) {
        push(`Thanks — filed as issue #${row.githubIssueNumber}.`);
      } else {
        push('Thanks — your report has been logged.');
      }
      reset();
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e?.message || 'Could not submit the report.';
      setErr(msg);
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Report an issue" subtitle="Sends to the Campaign Buddy dev team" onClose={close}>
      {err ? <div className="error-state" style={{ marginBottom: 14 }}>{err}</div> : null}

      <div className="form-row">
        <label>Type</label>
        <div className="radio-row">
          {CATEGORIES.map(([v, l]) => (
            <span
              key={v}
              className={`chip-opt ${category === v ? 'selected' : ''}`}
              onClick={() => setCategory(v)}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      {category === 'bug' ? (
        <div className="form-row">
          <label>Severity</label>
          <div className="radio-row">
            {SEVERITIES.map(([v, l]) => (
              <span
                key={v}
                className={`chip-opt ${severity === v ? 'selected' : ''}`}
                onClick={() => setSeverity(v)}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="form-row">
        <label>Title <span className="req">*</span></label>
        <input
          type="text"
          value={title}
          maxLength={160}
          placeholder={category === 'bug' ? 'e.g. Live map panel is blank on load' : 'e.g. Add CSV export to SKU report'}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>
          {category === 'bug' ? 'What happened? Steps to reproduce, what you expected' : 'Details'}{' '}
          <span className="req">*</span>
        </label>
        <textarea
          rows={6}
          value={body}
          maxLength={8000}
          placeholder={
            category === 'bug'
              ? '1. Went to...\n2. Clicked...\n3. Saw...\nExpected: ...'
              : 'Describe the change and why it would help.'
          }
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Attached automatically</label>
        <div className="rank-meta" style={{ lineHeight: 1.7 }}>
          Page <code>{context.page}</code> · {persona} · {user?.displayName}
          {context.campaignName ? <> · campaign “{context.campaignName}”</> : null}
          <br />
          Portal {context.portalVersion}
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={close} disabled={submitting}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </Modal>
  );
}
