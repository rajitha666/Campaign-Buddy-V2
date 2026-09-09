import { useState } from 'react';
import { NAV } from '../config/nav';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import ReportIssueModal from './ReportIssueModal';

function findLabel(pathname) {
  for (const sec of NAV) {
    for (const item of sec.items) {
      if (item.path === pathname) return { title: item.label, crumb: sec.section || 'Home' };
      if (item.children) {
        for (const c of item.children) {
          if (c.path === pathname) return { title: c.label, crumb: item.label };
        }
      }
    }
  }
  return { title: 'Campaign Buddy', crumb: 'Portal' };
}

export default function Topbar() {
  const { user, persona, campaignList, currentCampaignId, setCurrentCampaignId, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { title, crumb } = findLabel(location.pathname);

  const initials = (user?.displayName || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="topbar">
      <div>
        <div className="crumb">{crumb}</div>
        <div className="page-title-mini">{title}</div>
      </div>
      <div className="topbar-right">
        {persona === 'admin' ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setReportOpen(true)}
            title="Report a bug or suggest an enhancement"
          >
            🐞 Report issue
          </button>
        ) : null}
        <div className="switcher">
          🗂️
          <select
            value={currentCampaignId || ''}
            onChange={(e) => setCurrentCampaignId(e.target.value)}
            disabled={campaignList.length === 0}
          >
            {campaignList.length === 0 ? <option value="">No campaigns</option> : null}
            {campaignList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="switcher">
          <span className={`badge ${persona === 'admin' ? 'success' : persona === 'supervisor' ? 'info' : 'muted'}`}>
            {persona}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="topbar-avatar" onClick={() => setMenuOpen((o) => !o)}>{initials}</div>
          {menuOpen ? (
            <div className="logout-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="item" style={{ cursor: 'default' }}>
                <div className="cell-strong">{user?.displayName}</div>
                <div className="cell-muted" style={{ fontSize: 11 }}>{user?.roleId}</div>
              </div>
              <div className="item" onClick={logout}>Log out</div>
            </div>
          ) : null}
        </div>
      </div>
      {persona === 'admin' ? (
        <ReportIssueModal open={reportOpen} onClose={() => setReportOpen(false)} />
      ) : null}
    </div>
  );
}
