/**
 * Holds the signed-in user and exposes login/logout. Persists tokens in
 * SecureStore (not AsyncStorage) since they're credentials, not app data.
 *
 * RootNavigator reads `user` from here to decide whether to show the
 * AuthStack (Login) or MainTabs — see navigation/RootNavigator.tsx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getItem, setItem, deleteItem } from '@/api/secureStore';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, registerAuthFailureHandler } from '@/api/client';
import * as authApi from '@/api/auth';
import * as profileApi from '@/api/profile';
import type { User } from '@/api/types';
import { canResumeOffline } from '@/lib/offlineSession';
import { isNetworkError } from '@/offline/networkError';
import { setStorageScope } from '@/offline/storage';
import { readCache } from '@/offline/cache';
import { cacheKeys } from '@/offline/localApply';
import { clearCachedDataIfIdle } from '@/offline/cleanup';
import { localDayKey } from '@/lib/date';
import {
  clearSessionSnapshots,
  loadAttendanceSnapshot,
  loadUserSnapshot,
  saveUserSnapshot,
} from '@/offline/sessionSnapshot';

const OFFLINE_RESUME_WAIT_MS = 8_000;

interface AuthContextValue {
  user: User | null;
  isLoading: boolean; // true while restoring a session on cold start
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch the signed-in user's profile (e.g. after uploading a new photo). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The axios refresh interceptor calls this when a session can't be recovered.
  useEffect(() => {
    registerAuthFailureHandler(() => setUser(null));
  }, []);

  // On cold start: if a token is already stored, try to fetch the profile
  // to confirm it's still valid rather than trusting it blindly.
  useEffect(() => {
    (async () => {
      try {
        const token = await getItem(ACCESS_TOKEN_KEY);
        if (token) {
          // Mid-shift resume is only possible when we already know the rep is
          // checked in today; without that we wait on the server as before.
          const cached = await loadUserSnapshot();
          if (cached) setStorageScope(cached.id); // needed to read this rep's cache below
          const shift = cached ? await loadAttendanceSnapshot(cached.id) : null;
          const assignment = cached ? await readCache(cacheKeys.assignment(localDayKey())).catch(() => null) : null;
          const resumable = canResumeOffline({
            hasCachedUser: !!cached,
            checkedInToday: !!shift?.checkedIn,
            checkedOutToday: !!shift?.checkedOutToday,
            hasTodayAssignment: !!assignment,
          });
          try {
            const meRequest = profileApi.getMe();
            // On a "connected but no internet" network the request can hang for
            // over a minute — bound it so a rep mid-shift isn't stuck on the splash.
            const me = await (resumable
              ? Promise.race([meRequest, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), OFFLINE_RESUME_WAIT_MS))])
              : meRequest);
            setStorageScope(me.id);
            saveUserSnapshot(me);
            setUser(me);
          } catch (err) {
            if (!isNetworkError(err)) throw err;
            // Couldn't reach the server — that says nothing about the token, so
            // keep it. Resume the open shift from the cached profile if we can;
            // otherwise the rep lands on Login (which needs a network anyway).
            if (cached && resumable) {
              setStorageScope(cached.id);
              setUser(cached);
            }
          }
        }
      } catch {
        // The server answered and rejected the token — fall through to the login screen.
        await deleteItem(ACCESS_TOKEN_KEY);
        await deleteItem(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password.trim());
    await setItem(ACCESS_TOKEN_KEY, result.accessToken);
    await setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    // The v3 backend's /auth/login returns only tokens, so pull the profile
    // separately (same call the cold-start path uses).
    const me = result.user ?? (await profileApi.getMe());
    setStorageScope(me.id);
    saveUserSnapshot(me);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, still clear local session below —
      // we don't want a dead network to trap the user signed in.
    }
    await deleteItem(ACCESS_TOKEN_KEY);
    await deleteItem(REFRESH_TOKEN_KEY);
    await clearSessionSnapshots();
    await clearCachedDataIfIdle();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await profileApi.getMe();
    saveUserSnapshot(me);
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
