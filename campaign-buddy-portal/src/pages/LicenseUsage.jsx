import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { license as licenseApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

const GROUP_LABELS = { promoter: 'Promoters', supervisor: 'Supervisors', admin: 'Admins', sponsor: 'Sponsors' };
const STATE_BADGE = { ok: 'success', warn: 'pending', at: 'info', over: 'alert' };
const STATE_LABEL = { ok: 'OK', warn: 'Near limit', at: 'At limit', over: 'Over limit' };
const STATE_COLOR = { ok: 'var(--success)', warn: 'var(--pending)', at: 'var(--info)', over: 'var(--alert)' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function UsageBar({ pct, state }) {
  return (
    <div style={{ height: 8, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--line)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: STATE_COLOR[state] || 'var(--info)' }} />
    </div>
  );
}

function GroupCard({ group }) {
  return (
    <div className="stat-card">
      <div className="l">{GROUP_LABELS[group.group] || group.group}</div>
      <div className="n">{group.used} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>/ {group.cap}</span></div>
      <UsageBar pct={group.pct} state={group.state} />
      <div style={{ marginTop: 8 }}><Badge type={STATE_BADGE[group.state]}>{STATE_LABEL[group.state]}</Badge></div>
    </div>
  );
}

const EMPTY_FORM = { promoterCap: '', supervisorCap: '', adminCap: '', sponsorCap: '', warnThresholdPct: '' };

export default function LicenseUsage() {
  const { currentCampaignId, currentCampaign, isSuperAdmin } = useAuth();
  const { push } = useToast();

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [period, setPeriod] = useState('week');
  const [history, setHistory] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState(null);

  const [rollup, setRollup] = useState(null);
  const [rollupLoading, setRollupLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState('');

  const loadDetail = useCallback(() => {
    if (!currentCampaignId) return;
    setDetailLoading(true);
    setDetailError(null);
    licenseApi.get(currentCampaignId)
      .then((res) => setDetail(res?.data || null))
      .catch((e) => setDetailError(e.message || 'Could not load license usage.'))
      .finally(() => setDetailLoading(false));
  }, [currentCampaignId]);
  useEffect(loadDetail, [loadDetail]);

  useEffect(() => {
    if (!currentCampaignId) return;
    licenseApi.history(currentCampaignId, { period, limit: 12 })
      .then((res) => setHistory(res?.data || []))
      .catch(() => setHistory([]));
  }, [currentCampaignId, period]);

  const loadRollup = useCallback(() => {
    setRollupLoading(true);
    licenseApi.usage(stateFilter ? { state: stateFilter } : undefined)
      .then((res) => setRollup(res?.data || []))
      .catch(() => setRollup([]))
      .finally(() => setRollupLoading(false));
  }, [stateFilter]);
  useEffect(loadRollup, [loadRollup]);

  function openEdit() {
    setFormErr(null);
    setForm({
      promoterCap: String(groupCap('promoter')),
      supervisorCap: String(groupCap('supervisor')),
      adminCap: String(groupCap('admin')),
      sponsorCap: String(groupCap('sponsor')),
      warnThresholdPct: detail?.warnThresholdIsDefault ? '' : String(detail?.warnThresholdPct ?? ''),
    });
    setModalOpen(true);
  }
  function groupCap(name) {
    return (detail?.groups || []).find((g) => g.group === name)?.cap ?? 0;
  }

  async function save() {
    setFormErr(null);
    const body = {};
    for (const k of ['promoterCap', 'supervisorCap', 'adminCap', 'sponsorCap']) {
      const n = Number(form[k]);
      if (form[k] === '' || !Number.isInteger(n) || n < 0) { setFormErr('Seat caps must be whole numbers (0 or more).'); return; }
      body[k] = n;
    }
    if (form.warnThresholdPct === '') {
      body.warnThresholdPct = null;
    } else {
      const w = Number(form.warnThresholdPct);
      if (!Number.isInteger(w) || w < 1 || w > 99) { setFormErr('Warning threshold must be between 1 and 99, or blank for the default.'); return; }
      body.warnThresholdPct = w;
    }
    setSaving(true);
    try {
      const res = await licenseApi.update(currentCampaignId, body);
      setDetail(res?.data || null);
      setModalOpen(false);
      push('License caps updated');
      loadRollup();
    } catch (e) {
      setFormErr(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (!currentCampaignId) return <ErrorState message="Select a campaign from the top bar first." />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>License Usage</h1>
          <p className="page-sub">Seat usage against the licensed caps for each campaign. Limits are advisory — going over never blocks assignment.</p>
        </div>
        {isSuperAdmin && detail ? <button className="btn btn-primary" onClick={openEdit}>Edit caps</button> : null}
      </div>

      {detailLoading ? <Loader /> : detailError ? <ErrorState message={detailError} onRetry={loadDetail} /> : detail ? (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="panel-title">{currentCampaign?.name || detail.campaignName}</div>
                <div className="panel-sub">{detail.campaignNo} · warns at {detail.warnThresholdPct}% of cap{detail.warnThresholdIsDefault ? ' (default)' : ''}</div>
              </div>
              <Badge type={STATE_BADGE[detail.overallState]}>{STATE_LABEL[detail.overallState]}</Badge>
            </div>
            <div className="stat-grid" style={{ marginTop: 16 }}>
              {detail.groups.map((g) => <GroupCard key={g.group} group={g} />)}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="panel-title">Usage over time</div>
                <div className="panel-sub">Peak seats recorded each {period}.</div>
              </div>
              <div className="radio-row">
                {['week', 'month'].map((p) => (
                  <span key={p} className={`chip-opt ${period === p ? 'selected' : ''}`} onClick={() => setPeriod(p)}>
                    {p === 'week' ? 'Weekly' : 'Monthly'}
                  </span>
                ))}
              </div>
            </div>
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr><th>{period === 'week' ? 'Week of' : 'Month'}</th><th>Promoters</th><th>Supervisors</th><th>Admins</th><th>Sponsors</th></tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={5} className="cell-muted">No snapshots recorded yet — the first is captured within a day.</td></tr>
                  ) : history.map((h) => (
                    <tr key={h.id}>
                      <td className="cell-strong">{fmtDate(h.periodStart)}</td>
                      <td>{h.promoterUsed} / {h.promoterCap}</td>
                      <td>{h.supervisorUsed} / {h.supervisorCap}</td>
                      <td>{h.adminUsed} / {h.adminCap}</td>
                      <td>{h.sponsorUsed} / {h.sponsorCap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="panel-title">All campaigns</div>
            <div className="panel-sub">License usage across every campaign you can access.</div>
          </div>
          <div className="filter-field">
            <label>Show</label>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="">All campaigns</option>
              <option value="warn">Near limit or worse</option>
              <option value="over">Over limit only</option>
            </select>
          </div>
        </div>
        {rollupLoading ? <Loader /> : (
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr><th>Campaign</th><th>Client</th><th>Status</th><th>Promoters</th><th>Supervisors</th><th>Admins</th><th>Sponsors</th><th>Overall</th></tr>
              </thead>
              <tbody>
                {(rollup || []).length === 0 ? (
                  <tr><td colSpan={8} className="cell-muted">No campaigns match.</td></tr>
                ) : rollup.map((r) => {
                  const cell = (name) => {
                    const g = r.groups.find((x) => x.group === name);
                    return <td style={g.state === 'over' ? { color: 'var(--alert)', fontWeight: 700 } : undefined}>{g.used} / {g.cap}</td>;
                  };
                  return (
                    <tr key={r.campaignId}>
                      <td className="cell-strong">{r.campaignName}<div className="rank-meta">{r.campaignNo}</div></td>
                      <td>{r.clientName}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.status}</td>
                      {cell('promoter')}{cell('supervisor')}{cell('admin')}{cell('sponsor')}
                      <td><Badge type={STATE_BADGE[r.overallState]}>{STATE_LABEL[r.overallState]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} title="Edit license caps" subtitle={currentCampaign?.name} onClose={() => setModalOpen(false)}>
        {formErr ? <div className="error-state" style={{ marginBottom: 14 }}>{formErr}</div> : null}
        {[['promoterCap', 'Promoters'], ['supervisorCap', 'Supervisors'], ['adminCap', 'Admins'], ['sponsorCap', 'Sponsors']].map(([k, l]) => (
          <div className="form-row" key={k}>
            <label>{l} seat cap</label>
            <input type="number" min="0" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
        <div className="form-row">
          <label>Warning threshold (%)</label>
          <input type="number" min="1" max="99" placeholder="blank = default" value={form.warnThresholdPct}
            onChange={(e) => setForm((f) => ({ ...f, warnThresholdPct: e.target.value }))} />
          <div className="rank-meta">Groups turn “near limit” at this share of the cap. Leave blank to use the system default.</div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save caps'}</button>
        </div>
      </Modal>
    </div>
  );
}
