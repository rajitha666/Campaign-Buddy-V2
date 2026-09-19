import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { preferences as preferencesApi } from '../lib/endpoints';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { applyPreferencePatch } from '../lib/preferences';
import { FAVORITES_KEY, toggleFavorite, moveFavorite } from '../lib/favorites';

// Per-account portal personalization (favorite menu pages, and whatever options
// come next). Stored on the server against the signed-in user, so it follows
// them to any browser or device. See docs/product-documentation.md
// "Personalization" and backend utils/userPreferences.ts.
const PrefsCtx = createContext(null);

export function PreferencesProvider({ children }) {
  const { status, user } = useAuth();
  const { push } = useToast();
  const [prefs, setPrefs] = useState({});
  const [loaded, setLoaded] = useState(false);
  // Saves go out one at a time, in the order the user made them, so two quick
  // clicks can't land out of order on the server.
  const queue = useRef(Promise.resolve());

  const load = useCallback(async () => {
    try {
      const res = await preferencesApi.get();
      setPrefs(res?.data || {});
    } catch {
      // Non-fatal: the portal works without personalization (defaults apply).
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (status === 'authed') load();
    else if (status === 'anon') { setPrefs({}); setLoaded(false); }
  }, [status, user?.id, load]);

  // Optimistic: the UI changes immediately; if the save fails we tell the user
  // and reload the real server state so nothing looks saved when it isn't.
  const update = useCallback((patch) => {
    setPrefs((p) => applyPreferencePatch(p, patch));
    queue.current = queue.current
      .then(() => preferencesApi.update(patch))
      .catch(() => {
        push('Could not save your personalization. Reverted.', 'error');
        return load();
      });
  }, [load, push]);

  const value = useMemo(() => ({ prefs, loaded, update }), [prefs, loaded, update]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PrefsCtx);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

// Favorite pages: `paths` in the user's order, plus toggle/move helpers.
export function useFavorites() {
  const { prefs, update } = usePreferences();
  const { push } = useToast();
  const paths = prefs[FAVORITES_KEY] || [];

  const isFavorite = useCallback((path) => paths.includes(path), [paths]);
  const toggle = useCallback((path) => {
    const res = toggleFavorite(paths, path);
    if (res.limitReached) { push('You can pin up to 12 favorites. Remove one first.', 'error'); return; }
    update({ [FAVORITES_KEY]: res.paths.length ? res.paths : null });
  }, [paths, update, push]);
  const move = useCallback((path, delta) => {
    update({ [FAVORITES_KEY]: moveFavorite(paths, path, delta) });
  }, [paths, update]);

  return { paths, isFavorite, toggle, move };
}
