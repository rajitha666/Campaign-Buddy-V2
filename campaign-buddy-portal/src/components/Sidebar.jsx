import { useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '../config/nav';
import { ICONS } from './Icons';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
  const { persona } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const roleLabel = persona === 'admin' ? 'SUPER ADMIN' : persona === 'supervisor' ? 'SUPERVISOR' : 'SPONSOR';

  return (
    <div className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M4 17L9 12L13 16L20 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 8H20V14" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name h-display">Campaign Buddy</div>
          <div className="brand-role-pill">{roleLabel}</div>
        </div>
        {onToggleCollapse ? (
          <button
            type="button"
            className="nav-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="nav-scroll">
        {NAV.map((sec, si) => {
          if (sec.roles && !sec.roles.includes(persona)) return null;
          const visibleItems = sec.items.filter((it) => it.roles.includes(persona));
          if (visibleItems.length === 0) return null;
          return (
            <div key={si}>
              {sec.section ? <div className="nav-section-label">{sec.section}</div> : null}
              {visibleItems.map((it, ii) => (
                <NavEntry key={ii} item={it} pathname={location.pathname} navigate={navigate} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavEntry({ item, pathname, navigate }) {
  if (item.children) {
    const activeParent = item.children.some((c) => c.path === pathname);
    return (
      <div className="nav-group">
        <div className={`nav-item ${activeParent ? 'active' : ''}`}>
          {ICONS[item.icon]}<span>{item.label}</span>
        </div>
        <div className="nav-children">
          <div className="nav-flyout-title">{item.label}</div>
          {item.children.map((c) => (
            <div
              key={c.path}
              className={`nav-child ${c.path === pathname ? 'active' : ''}`}
              onClick={() => navigate(c.path)}
            >
              <span className="dot" />{c.label}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="nav-group">
      <div
        className={`nav-item ${item.path === pathname ? 'active' : ''}`}
        onClick={() => navigate(item.path)}
        title={item.label}
      >
        {ICONS[item.icon]}<span>{item.label}</span>
      </div>
      <div className="nav-flyout-label">{item.label}</div>
    </div>
  );
}
