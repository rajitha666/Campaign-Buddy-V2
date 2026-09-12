import { useEffect, useState } from 'react';
import { staff as staffApi } from '../lib/endpoints';
import Loader from '../components/Loader';
import ErrorState from '../components/ErrorState';
import Badge from '../components/Badge';
import SearchableSelect from '../components/SearchableSelect';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—');
const typeLabel = (t) => (t === 'supervisor' ? 'Supervisor' : 'Promoter');

function Field({ label, value }) {
  return (
    <div className="detail-field">
      <div className="l">{label}</div>
      <div className="v">{value || value === 0 ? value : '—'}</div>
    </div>
  );
}

function ActivationTrend({ activations }) {
  const chronological = [...activations].sort((a, b) => new Date(a.dateFrom) - new Date(b.dateFrom));
  const maxSales = Math.max(1, ...chronological.map((a) => a.sales));
  const maxApproached = Math.max(1, ...chronological.map((a) => a.customersApproached));
  return (
    <>
      <div className="trend-legend">
        <div className="item"><span className="sw" style={{ background: 'var(--mango)' }} />Sales</div>
        <div className="item"><span className="sw" style={{ background: 'var(--info)' }} />Customers approached</div>
      </div>
      <div className="chart-scroll">
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', height: 160, padding: '12px 4px 0', minWidth: chronological.length * 68 }}>
          {chronological.map((a) => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 56, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                <div title={`Sales: LKR ${a.sales.toLocaleString()}`} style={{ width: 16, borderRadius: '4px 4px 0 0', background: 'var(--mango)', height: `${Math.max(4, (a.sales / maxSales) * 120)}px` }} />
                <div title={`Customers approached: ${a.customersApproached}`} style={{ width: 16, borderRadius: '4px 4px 0 0', background: 'var(--info)', height: `${Math.max(4, (a.customersApproached / maxApproached) * 120)}px` }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>{fmtDate(a.dateFrom)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function StaffProfiles() {
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // pageSize:1000 — the default 25-per-page cap would silently hide staff
    // further down the list once the roster grows past one page.
    staffApi.search('', { pageSize: 1000 }).then((res) => {
      const opts = res?.data || [];
      setStaffOptions(opts);
      if (opts[0]) setStaffId(opts[0].id);
    }).catch(() => {});
  }, []);

  async function load(id) {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const res = await staffApi.evaluation(id, {});
      setData(res?.data || null);
    } catch (e) {
      setError(e.message || 'Could not load this profile.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(staffId); /* eslint-disable-next-line */ }, [staffId]);

  const selectOptions = staffOptions.map((s) => ({
    value: s.id,
    label: `${s.fullName || s.displayName} — ${typeLabel(s.userType)}`,
  }));

  const profile = data?.profile;
  const activations = data?.activations || [];
  // Usually one, but a staff member can be active on more than one campaign's
  // activation at once (rare) — show every one of them, not just the first.
  const activeNow = activations.filter((a) => a.isCurrent);
  const fallback = activations.find((a) => a.id === data?.currentActivationId) || null;
  const currentActivations = activeNow.length ? activeNow : (fallback ? [fallback] : []);

  return (
    <div>
      <div className="page-head"><div><h1>Staff Profiles</h1><p className="page-sub">Per-staff profile and performance analytics.</p></div></div>
      <div className="filter-bar">
        <div className="filter-field" style={{ minWidth: 300 }}>
          <label>Staff Member</label>
          <SearchableSelect options={selectOptions} value={staffId} onChange={setStaffId} placeholder="Search by name…" />
        </div>
      </div>
      {loading ? <Loader /> : error ? <ErrorState message={error} onRetry={() => load(staffId)} /> : !data ? (
        <ErrorState message="No profile data returned for this staff member yet." />
      ) : (
        <>
          <div className="dash-grid">
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="avatar-mini" style={{ width: 56, height: 56, fontSize: 19, borderRadius: 16 }}>
                  {(profile?.displayName || profile?.fullName || '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="h-display" style={{ fontSize: 17 }}>{profile?.fullName || profile?.displayName}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <Badge type={profile?.userType === 'supervisor' ? 'success' : 'info'}>{typeLabel(profile?.userType)}</Badge>
                    <Badge type={profile?.status === 'active' ? 'success' : 'muted'}>{profile?.status}</Badge>
                  </div>
                </div>
              </div>
              <div className="detail-grid">
                <Field label="Employee ID" value={profile?.employeeId} />
                <Field label="Display Name" value={profile?.displayName} />
                <Field label="Mobile App Username" value={profile?.mobileUsername} />
                <Field label="Mobile" value={profile?.phone} />
                <Field label="Home City" value={profile?.cityName} />
                <Field label="Reports To" value={profile?.reportsToName} />
                <Field label="Date of Birth" value={profile?.dateOfBirth ? fmtDate(profile.dateOfBirth) : null} />
                <Field label="Gender" value={profile?.gender} />
                <Field label="NIC" value={profile?.nic} />
                <Field label="Permanent Address" value={profile?.permanentAddress} />
                <Field label="Current Address" value={profile?.currentAddress} />
                <Field label="Emergency Contact" value={profile?.emergencyContactName} />
                <Field label="Emergency Phone" value={profile?.emergencyContactPhone} />
                <Field label="Bank Account Name" value={profile?.bankAccountName} />
                <Field label="Bank" value={profile?.bankName} />
                <Field label="Bank Account Number" value={profile?.bankAccountNumber} />
                <Field label="Bank Branch" value={profile?.bankBranch} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">{activeNow.length ? (activeNow.length > 1 ? 'Current activations' : 'Current activation') : 'Last activation'}</div>
              {currentActivations.length === 0 ? (
                <div className="cell-muted" style={{ marginTop: 10 }}>No activations yet.</div>
              ) : (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {currentActivations.map((a) => (
                    <div key={a.id}>
                      <div className="h-display" style={{ fontSize: 15 }}>{a.campaignName}</div>
                      <div className="cell-muted" style={{ marginTop: 2 }}>{a.outletName} · {fmtDate(a.dateFrom)} – {fmtDate(a.dateTo)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Overall Performance</div><div className="n" style={{ fontSize: 17 }}>{data.overallPerformancePct ?? '—'}%</div></div>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Attendance</div><div className="n" style={{ fontSize: 17 }}>{data.attendancePct ?? '—'}%</div></div>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Total Sales</div><div className="n" style={{ fontSize: 17 }}>LKR {(data.totalSales ?? 0).toLocaleString()}</div></div>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Total Products</div><div className="n" style={{ fontSize: 17 }}>{data.totalItems ?? 0} units</div></div>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Customers Approached</div><div className="n" style={{ fontSize: 17 }}>{(data.customersApproached ?? 0).toLocaleString()}</div></div>
                <div className="stat-card" style={{ padding: 13 }}><div className="l">Highest Daily Sales</div><div className="n" style={{ fontSize: 17 }}>LKR {(data.highestDailySales ?? 0).toLocaleString()}</div></div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">Most sold products</div>
              {(data.topProducts || []).length === 0 ? <div className="cell-muted" style={{ marginTop: 12 }}>No sales recorded yet.</div> : (
                <div style={{ marginTop: 12 }}>
                  {data.topProducts.map((p, i) => (
                    <div className="rank-row" key={p.name || i}>
                      <div className="rank-num">{i + 1}</div>
                      <div><div className="rank-name">{p.name}</div><div className="rank-meta">{p.qty.toLocaleString()} units</div></div>
                      <div className="rank-val">LKR {p.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-title">Brand contribution</div>
              {(data.brandContribution || []).length === 0 ? <div className="cell-muted" style={{ marginTop: 12 }}>No brand breakdown returned.</div> : (
                <div style={{ marginTop: 12 }}>
                  {data.brandContribution.map((b, i) => (
                    <div className="rank-row" key={i}>
                      <div className="sw" style={{ width: 9, height: 9, borderRadius: '50%', background: ['#FF7A33', '#2673B0', '#1F9D55'][i % 3], marginRight: 8 }} />
                      {b.brandName}<div className="rank-val">{b.percent}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-title">Sales &amp; customers approached — by activation</div>
            <div className="panel-sub">Oldest to most recent</div>
            {activations.length === 0 ? <div className="cell-muted" style={{ marginTop: 12 }}>No activations yet.</div> : <ActivationTrend activations={activations} />}
          </div>

          <div className="table-card" style={{ marginTop: 16 }}>
            <div style={{ padding: '14px 18px', fontWeight: 700, fontSize: 13.5 }}>Previous activations</div>
            {activations.length === 0 ? (
              <div className="empty-state">No activations yet.</div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Campaign</th><th>Outlet</th><th>From</th><th>To</th><th>Sales</th><th>Customers Approached</th><th></th></tr></thead>
                  <tbody>
                    {activations.map((a) => (
                      <tr key={a.id}>
                        <td className="cell-strong">{a.campaignName}</td>
                        <td>{a.outletName}</td>
                        <td>{fmtDate(a.dateFrom)}</td>
                        <td>{fmtDate(a.dateTo)}</td>
                        <td>LKR {a.sales.toLocaleString()}</td>
                        <td>{a.customersApproached.toLocaleString()}</td>
                        <td>{a.isCurrent ? <Badge type="success">Current</Badge> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <div className="hint-note" style={{ marginTop: 12 }}>
        Reads GET /admin/v1/staff/{'{staffId}'}/evaluation (Backend Spec v3 §4.2).
      </div>
    </div>
  );
}
