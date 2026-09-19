import { useMemo } from 'react';
import { NAV } from '../config/nav';
import { useAuth } from '../context/AuthContext';
import { useFavorites, usePreferences } from '../context/PreferencesContext';
import { navEntriesFor, resolveFavorites, entryLabel, MAX_FAVORITES } from '../lib/favorites';
import { PREFERENCE_KEYS } from '../lib/preferences';
import { applyDesignationLabel } from '../lib/designationLabel';
import { ICONS } from '../components/Icons';
import Loader from '../components/Loader';

// Personalization — the user's own portal settings, saved on their account so
// they follow them to any browser or device. To add an option: register its key
// in the backend (utils/userPreferences.ts) and lib/preferences.js, build a
// section component below and add it to SECTIONS.

function FavoritesSection() {
  const { persona, designationLabel } = useAuth();
  const { paths, toggle, move } = useFavorites();
  const entries = useMemo(() => navEntriesFor(NAV, persona), [persona]);
  const favs = resolveFavorites(paths, entries);

  return (
    <div className="panel pref-section">
      <div className="panel-title">Favorite pages</div>
      <div className="panel-sub">
        Pinned to the top of your menu, in this order. Star any page in the menu, or use the star next to a
        page's title. Up to {MAX_FAVORITES}.
      </div>
      <div style={{ marginTop: 10 }}>
        {favs.length === 0 ? (
          <div className="cell-muted" style={{ padding: '10px 4px' }}>No favorites yet.</div>
        ) : favs.map((e, i) => (
          <div className="fav-row" key={e.path}>
            <div className="fav-name">
              <div className="cell-strong">{applyDesignationLabel(entryLabel(e), designationLabel)}</div>
              <div className="cell-muted" style={{ fontSize: 11 }}>{e.path}</div>
            </div>
            <div className="fav-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={i === 0}
                onClick={() => move(e.path, -1)} aria-label={`Move ${entryLabel(e)} up`} title="Move up">↑</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={i === favs.length - 1}
                onClick={() => move(e.path, 1)} aria-label={`Move ${entryLabel(e)} down`} title="Move down">↓</button>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => toggle(e.path)} aria-label={`Remove ${entryLabel(e)} from favorites`} title="Remove">{ICONS.close}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SECTIONS = [FavoritesSection];

export default function Personalization() {
  const { loaded, update } = usePreferences();

  if (!loaded) return <Loader label="Loading your preferences…" />;

  function resetAll() {
    if (!window.confirm('Reset all your personalization to the defaults?')) return;
    update(Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, null])));
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Personalization</h1>
          <p className="page-sub">Your own settings, saved to your account and applied wherever you sign in.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={resetAll}>Reset all</button>
      </div>
      {SECTIONS.map((Section, i) => <Section key={i} />)}
    </div>
  );
}
