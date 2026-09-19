import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '../config/nav';
import { ICONS } from './Icons';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';
import { useFavorites } from '../context/PreferencesContext';
import { navEntriesFor, resolveFavorites, entryLabel } from '../lib/favorites';

export default function Sidebar({ collapsed = false, isPhone = false, onToggleCollapse, onNavigate }) {
  const { persona, designationLabel } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Which collapsed nav-group's flyout is pinned open by a tap — hover alone
  // never fires on touch, so collapsed groups need a click-to-open fallback.
  const [openGroup, setOpenGroup] = useState(null);
  // Personalization: pages this user starred, pinned above the regular menu.
  const favorites = useFavorites();
  const favEntries = useMemo(
    () => resolveFavorites(favorites.paths, navEntriesFor(NAV, persona)),
    [favorites.paths, persona]
  );

  const roleLabel = persona === 'admin' ? 'SUPER ADMIN' : persona === 'supervisor' ? 'SUPERVISOR' : 'SPONSOR';

  function go(path) {
    navigate(path);
    setOpenGroup(null);
    onNavigate?.();
  }

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
            aria-label={isPhone ? 'Close menu' : collapsed ? 'Expand menu' : 'Collapse menu'}
            title={isPhone ? 'Close menu' : collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {isPhone ? ICONS.close : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      <div className="nav-scroll">
        {favEntries.length > 0 ? (
          <div>
            <div className="nav-section-label">Favorites</div>
            {favEntries.map((e) => (
              <NavEntry
                key={`fav-${e.path}`}
                item={{ path: e.path, label: entryLabel(e), icon: e.icon, roles: [persona] }}
                pathname={location.pathname}
                go={go}
                isOpen={false}
                onToggleOpen={() => {}}
                designationLabel={designationLabel}
                favorites={favorites}
              />
            ))}
          </div>
        ) : null}
        {NAV.map((sec, si) => {
          if (sec.roles && !sec.roles.includes(persona)) return null;
          const visibleItems = sec.items.filter((it) => it.roles.includes(persona));
          if (visibleItems.length === 0) return null;
          return (
            <div key={si}>
              {sec.section ? <div className="nav-section-label">{applyDesignationLabel(sec.section, designationLabel)}</div> : null}
              {visibleItems.map((it, ii) => (
                <NavEntry
                  key={ii}
                  item={it}
                  pathname={location.pathname}
                  go={go}
                  isOpen={openGroup === `${si}-${ii}`}
                  onToggleOpen={() => setOpenGroup((g) => (g === `${si}-${ii}` ? null : `${si}-${ii}`))}
                  designationLabel={designationLabel}
                  favorites={favorites}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Star toggle shown on every page entry. Stops the click so starring never
// navigates. Hidden until hover/focus unless already a favorite.
function StarButton({ path, name, favorites }) {
  const on = favorites.isFavorite(path);
  const text = on ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
  return (
    <button
      type="button"
      className={`nav-star${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={text}
      title={text}
      onClick={(e) => { e.stopPropagation(); favorites.toggle(path); }}
    >
      {on ? ICONS.starFilled : ICONS.star}
    </button>
  );
}

function NavEntry({ item, pathname, go, isOpen, onToggleOpen, designationLabel, favorites }) {
  const label = (text) => applyDesignationLabel(text, designationLabel);
  if (item.children) {
    const activeParent = item.children.some((c) => c.path === pathname);
    return (
      <div className={`nav-group ${isOpen ? 'flyout-open' : ''}`}>
        <div className={`nav-item ${activeParent ? 'active' : ''}`} onClick={onToggleOpen}>
          {ICONS[item.icon]}<span>{label(item.label)}</span>
        </div>
        <div className="nav-children">
          <div className="nav-flyout-title">{label(item.label)}</div>
          {item.children.map((c) => (
            <div
              key={c.path}
              className={`nav-child ${c.path === pathname ? 'active' : ''}`}
              onClick={() => go(c.path)}
            >
              <span className="dot" />{label(c.label)}
              <StarButton path={c.path} name={label(c.label)} favorites={favorites} />
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
        onClick={() => go(item.path)}
        title={label(item.label)}
      >
        {ICONS[item.icon]}<span>{label(item.label)}</span>
        <StarButton path={item.path} name={label(item.label)} favorites={favorites} />
      </div>
      <div className="nav-flyout-label">{label(item.label)}</div>
    </div>
  );
}
