import { useState } from 'react';
import { NAV } from '../config/nav';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import ReportIssueModal from './ReportIssueModal';
import { ICONS } from './Icons';

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

export default function Topbar({ onOpenMobileNav }) {
  const { user, persona, campaignList, currentCampaignId, setCurrentCampaignId, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { title, crumb } = findLabel(location.pathname);

  const initials = (user?.displayName || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  // Role training guides live in marketing/training/, served same-origin at
  // /training/ (see nginx.conf + scripts/sync-training.mjs). Each persona sees
  // its own guide; admins and supervisors also get the promoter guide since
  // they support promoters in the field.
  const GUIDE_LABELS = {
    admin: 'Admin guide',
    supervisor: 'Supervisor guide',
    sponsor: 'Sponsor guide',
    promoter: 'Promoter guide',
  };
  const GUIDES_BY_PERSONA = {
    admin: ['admin', 'promoter'],
    supervisor: ['supervisor', 'promoter'],
    sponsor: ['sponsor'],
  };
  const guides = GUIDES_BY_PERSONA[persona] || [];

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="hamburger-btn"
          onClick={onOpenMobileNav}
          aria-label="Open menu"
          title="Open menu"
        >
          {ICONS.menu}
        </button>
        <div>
          <div className="crumb">{crumb}</div>
          <div className="page-title-mini">{title}</div>
        </div>
      </div>
      <div className="topbar-right">
        {persona === 'admin' ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm report-issue-btn"
            onClick={() => setReportOpen(true)}
            title="Report a bug or suggest an enhancement"
          >
            🐞 <span className="btn-label-text">Report issue</span>
          </button>
        ) : null}
        <div className="switcher campaign-switcher">
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
        <div className="switcher persona-switcher">
          <span className={`badge ${persona === 'admin' ? 'success' : persona === 'supervisor' ? 'info' : 'muted'}`}>
            {persona}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div
            className="topbar-profile"
            onClick={() => setMenuOpen((o) => !o)}
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <div className="topbar-avatar">{initials}</div>
            <span className={`topbar-profile-caret${menuOpen ? ' is-open' : ''}`}>{ICONS.chevron}</span>
          </div>
          {menuOpen ? (
            <div className="logout-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="item" style={{ cursor: 'default' }}>
                <div className="cell-strong">{user?.displayName}</div>
                <div className="cell-muted" style={{ fontSize: 11 }}>{user?.roleId}</div>
              </div>
              {guides.length > 0 ? (
                <div className="item" style={{ cursor: 'default', paddingBottom: 2 }}>
                  <div className="cell-muted" style={{ fontSize: 11 }}>
                    {guides.length > 1 ? 'Training guides' : 'Training guide'}
                  </div>
                </div>
              ) : null}
              {guides.map((g) => (
                <a
                  key={g}
                  className="item"
                  href={`/training/${g}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  📖 {GUIDE_LABELS[g]}
                </a>
              ))}
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
