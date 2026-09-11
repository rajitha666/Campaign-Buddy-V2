import { useCallback, useEffect, useState } from 'react';
import { systemStatus } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Badge from '../components/Badge';

const PORTAL_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const JOB_LABEL = {
  backend: 'Backend tests',
  portal: 'Portal tests',
  app: 'Mobile app',
  'portal-e2e': 'Portal e2e',
  'app-e2e': 'Mobile app e2e',
  'training-docs-reminder': 'Training docs reminder',
};

const CONCLUSION_BADGE = { success: 'success', failure: 'alert', cancelled: 'muted', skipped: 'muted' };
const CONCLUSION_LABEL = {
  success: 'Passed', failure: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped',
};

function fmtWhen(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function StatusBadge({ status, conclusion }) {
  if (status !== 'completed') {
    return <Badge type="pending">{status === 'in_progress' ? 'Running' : 'Queued'}</Badge>;
  }
  return (
    <Badge type={CONCLUSION_BADGE[conclusion] || 'muted'}>
      {CONCLUSION_LABEL[conclusion] || conclusion || 'Unknown'}
    </Badge>
  );
}

export default function SystemStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    systemStatus
      .get()
      .then((res) => setData(res?.data || null))
      .catch((e) => setError(e.message || 'Could not load system status.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const ci = data?.ci;
  const run = ci?.run;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>System Status</h1>
          <p className="page-sub">
            Build version and the latest automated test run (GitHub Actions) — a quick check
            before shipping the next batch of changes.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <Loader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="table-card" style={{ marginBottom: 16, padding: 16, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div>
              <div className="cell-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Portal version</div>
              <div className="cell-strong">{PORTAL_VERSION}</div>
            </div>
            <div>
              <div className="cell-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Backend version</div>
              <div className="cell-strong">{data?.backendVersion || '—'}</div>
            </div>
            <div>
              <div className="cell-muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Last CI run</div>
              <div className="cell-strong">
                {run ? fmtWhen(run.updatedAt) : ci?.configured ? 'No runs yet' : 'Not connected'}
              </div>
              {run?.headCommitMessage ? (
                <div className="cell-muted" style={{ fontSize: 11 }}>
                  {run.headSha?.slice(0, 7)} · {run.headCommitMessage}
                </div>
              ) : null}
            </div>
          </div>

          {!ci?.configured ? (
            <div className="error-state" style={{ marginBottom: 16, background: 'var(--surface)', color: 'var(--text-muted)' }}>
              CI status isn't connected — set <code>GITHUB_TOKEN</code> (with Actions: Read) and{' '}
              <code>GITHUB_ISSUES_REPO</code> on the backend.
            </div>
          ) : ci.error ? (
            <div className="error-state" style={{ marginBottom: 16, background: 'var(--surface)', color: 'var(--alert)' }}>
              Could not reach GitHub: {ci.error}
            </div>
          ) : !run ? (
            <div className="error-state" style={{ marginBottom: 16, background: 'var(--surface)', color: 'var(--text-muted)' }}>
              The CI workflow hasn't run on <code>main</code> yet.
            </div>
          ) : (
            <div className="table-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Last run</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {run.jobs.map((j) => (
                      <tr key={j.name}>
                        <td className="cell-strong">{JOB_LABEL[j.name] || j.name}</td>
                        <td><StatusBadge status={j.status} conclusion={j.conclusion} /></td>
                        <td>{fmtWhen(j.completedAt || j.startedAt)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <a className="btn btn-secondary btn-sm" href={j.htmlUrl} target="_blank" rel="noreferrer">
                            View log ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
