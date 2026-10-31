import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '../config/nav';
import { ICONS } from './Icons';
import { useAuth } from '../context/AuthContext';
import { applyDesignationLabel } from '../lib/designationLabel';
import { useFavorites } from '../context/PreferencesContext';
import { navEntriesFor, resolveFavorites, entryLabel } from '../lib/favorites';
import { itemPath, itemIsActive } from '../lib/navTabs';
import { redirectFor } from '../config/legacyPaths';

const FOLD_KEY = 'cb.nav.sections';

function readFolds() {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch { return {}; }
}

function sectionHasPath(items, pathname) {
  return items.some((it) => itemIsActive(it, pathname));
}

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
    // Favorites saved on a retired page follow it to its replacement.
    () => resolveFavorites((favorites.paths || []).map((p) => redirectFor(p, persona) || p), navEntriesFor(NAV, persona)),
    [favorites.paths, persona]
  );

  // Section accordion: an explicit user choice wins; otherwise a section is
  // folded unless it holds the current page. Persisted per browser.
  const [folds, setFolds] = useState(readFolds);
  function toggleSection(name, currentlyFolded) {
    setFolds((f) => {
      const next = { ...f, [name]: !currentlyFolded };
      try { localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }

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
          const folded = sec.section
            ? folds[sec.section] ?? !sectionHasPath(visibleItems, location.pathname)
            : false;
          return (
            <div key={si}>
              {sec.section ? (
                <button
                  type="button"
                  className={`nav-section-label nav-section-toggle${folded ? ' is-folded' : ''}`}
                  aria-expanded={!folded}
                  onClick={() => toggleSection(sec.section, folded)}
                >
                  <span>{applyDesignationLabel(sec.section, designationLabel)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
              <div className={`nav-section-body${folded ? ' is-folded' : ''}`}>
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
  return (
    <div className="nav-group">
      <div
        className={`nav-item ${itemIsActive(item, pathname) ? 'active' : ''}`}
        onClick={() => go(itemPath(item))}
        title={label(item.label)}
      >
        {ICONS[item.icon]}<span>{label(item.label)}</span>
        <StarButton path={itemPath(item)} name={label(item.label)} favorites={favorites} />
      </div>
      <div className="nav-flyout-label">{label(item.label)}</div>
    </div>
  );
}
