import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, campaigns as campaignsApi } from '../lib/endpoints';
import { setAccessToken, loadStoredToken, registerUnauthorizedHandler, ApiError } from '../lib/apiClient';

const AuthCtx = createContext(null);

// Maps backend roleId (per CampaignBuddy_Unified_Backend_Spec.md §2.15 / Admin spec §1)
// down to the three UI personas this frontend renders differently for.
// adm / usr / super -> full write access (treated as "admin" in the UI)
// supervisor         -> read-only, outlet-scoped
// sponsor / client    -> read-only, campaign-scoped
export function roleToPersona(roleId) {
  if (['adm', 'usr', 'super'].includes(roleId)) return 'admin';
  if (roleId === 'supervisor') return 'supervisor';
  if (['sponsor', 'client'].includes(roleId)) return 'sponsor';
  return 'supervisor'; // safest default: read-only
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, displayName, roleId, defaultUrl }
  const [campaignList, setCampaignList] = useState([]); // scoped to caller's CampaignAccessGrant
  const [currentCampaignId, setCurrentCampaignId] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | anon
  const [authError, setAuthError] = useState(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await campaignsApi.list();
      const list = res?.data || [];
      setCampaignList(list);
      setCurrentCampaignId((prev) => prev || list[0]?.id || null);
    } catch (e) {
      // Non-fatal: dashboard/screens will show their own error states.
      setCampaignList([]);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    const token = loadStoredToken();
    if (!token) {
      setStatus('anon');
      return;
    }
    // No "GET /me" is defined for the web portal in the spec, so we trust the
    // stored user profile saved at login time rather than re-fetching it.
    const stored = localStorage.getItem('cb_user');
    if (stored) {
      setUser(JSON.parse(stored));
      setStatus('authed');
      await loadCampaigns();
    } else {
      setStatus('anon');
    }
  }, [loadCampaigns]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setAccessToken(null);
      localStorage.removeItem('cb_user');
      setUser(null);
      setStatus('anon');
    });
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthError(null);
    try {
      const res = await auth.login(username, password);
      const { accessToken, user: u } = res.data;
      setAccessToken(accessToken);
      localStorage.setItem('cb_user', JSON.stringify(u));
      setUser(u);
      setStatus('authed');
      await loadCampaigns();
      return true;
    } catch (e) {
      const message = e instanceof ApiError && e.status === 401
        ? 'Incorrect username or password.'
        : (e.message || 'Could not sign in.');
      setAuthError(message);
      return false;
    }
  }, [loadCampaigns]);

  const logout = useCallback(async () => {
    try { await auth.logout(); } catch { /* best-effort */ }
    setAccessToken(null);
    localStorage.removeItem('cb_user');
    setUser(null);
    setCampaignList([]);
    setCurrentCampaignId(null);
    setStatus('anon');
  }, []);

  const persona = useMemo(() => (user ? roleToPersona(user.roleId) : null), [user]);
  const currentCampaign = useMemo(
    () => campaignList.find((c) => c.id === currentCampaignId) || null,
    [campaignList, currentCampaignId]
  );

  const value = {
    user, status, authError, persona,
    campaignList, currentCampaignId, currentCampaign,
    setCurrentCampaignId,
    login, logout,
    isAdmin: persona === 'admin',
    isReadOnly: persona !== 'admin',
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
