import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { issueReports } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import Badge from '../components/Badge';

const STATUS_BADGE = { synced: 'success', pending: 'pending', failed: 'alert' };
const STATUS_LABEL = { synced: 'On GitHub', pending: 'Queued', failed: 'Failed' };
const CATEGORY_LABEL = { bug: 'Bug', enhancement: 'Enhancement', question: 'Question' };

function fmtWhen(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export default function IssueReports() {
  const { push } = useToast();
  const [rows, setRows] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    issueReports
      .list({ limit: 100 })
      .then((res) => {
        setRows(res?.data || []);
        setIntegration(res?.meta?.integration || null);
      })
      .catch((e) => setError(e.message || 'Could not load issue reports.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function retry(id) {
    setRetrying(id);
    try {
      const res = await issueReports.retry(id);
      const row = res?.data;
      setRows((rs) => rs.map((r) => (r.id === id ? row : r)));
      push(
        row?.syncStatus === 'synced'
          ? `Synced as issue #${row.githubIssueNumber}.`
          : 'Still could not reach GitHub — left queued.',
        row?.syncStatus === 'synced' ? 'default' : 'error',
      );
    } catch (e) {
      push(e.message || 'Retry failed.', 'error');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Issue Reports</h1>
          <p className="page-sub">
            Bugs and enhancement requests filed from the portal. When GitHub is connected each one opens
            an issue in the project repo.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {integration ? (
        <div className="error-state" style={{ marginBottom: 16, background: 'var(--surface)', color: 'var(--text-muted)' }}>
          {integration.configured ? (
            <>GitHub sync is <strong>on</strong> — issues open in <code>{integration.repo}</code>.</>
          ) : integration.enabled ? (
            <>GitHub sync is enabled but not fully configured — reports are being queued until a token and repo are set.</>
          ) : (
            <>GitHub sync is <strong>off</strong> — reports are saved here only. Set <code>GITHUB_ISSUES_ENABLED=1</code> on the backend to open issues automatically.</>
          )}
        </div>
      ) : null}

      {loading ? (
        <Loader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState title="No reports yet" hint="Use “Report issue” in the top bar to file one." />
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Reporter</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-strong">{r.title}</div>
                      {r.context?.page ? <div className="cell-muted" style={{ fontSize: 11 }}>{r.context.page}</div> : null}
                      {r.syncStatus === 'failed' && r.syncError ? (
                        <div className="cell-muted" style={{ fontSize: 11, color: 'var(--alert)' }}>{r.syncError}</div>
                      ) : null}
                    </td>
                    <td>
                      {CATEGORY_LABEL[r.category] || r.category}
                      {r.severity ? <div className="cell-muted" style={{ fontSize: 11 }}>{r.severity}</div> : null}
                    </td>
                    <td>{r.reporterName}</td>
                    <td>{fmtWhen(r.createdAt)}</td>
                    <td>
                      <Badge type={STATUS_BADGE[r.syncStatus] || 'muted'}>{STATUS_LABEL[r.syncStatus] || r.syncStatus}</Badge>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.githubIssueUrl ? (
                        <a className="btn btn-secondary btn-sm" href={r.githubIssueUrl} target="_blank" rel="noreferrer">
                          #{r.githubIssueNumber} ↗
                        </a>
                      ) : integration?.configured ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => retry(r.id)} disabled={retrying === r.id}>
                          {retrying === r.id ? 'Retrying…' : 'Retry sync'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
