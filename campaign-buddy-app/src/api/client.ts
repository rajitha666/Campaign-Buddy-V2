/**
 * Shared axios instance for every endpoint module in this folder.
 *
 * Set EXPO_PUBLIC_API_BASE_URL in your .env / eas.json build profiles. Falls
 * back to a placeholder so the app doesn't crash on first run.
 *
 * Auth: every request except /auth/* gets `Authorization: Bearer <token>`
 * attached from secureStore. On a 401 the response interceptor tries
 * /auth/refresh once, retries the original request, and — if that fails —
 * clears the session and notifies AuthContext (see registerAuthFailureHandler).
 */
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getItem, setItem, deleteItem } from './secureStore';
import type { ApiErrorBody } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.campaignbuddy.app/v1';

export const ACCESS_TOKEN_KEY = 'cb_access_token';
export const REFRESH_TOKEN_KEY = 'cb_refresh_token';

export const apiClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// Set by AuthContext — called when the session is unrecoverable (refresh failed).
let onAuthFailure: (() => void) | null = null;
export function registerAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

apiClient.interceptors.request.use(async (config) => {
  if (!config.url?.startsWith('/auth/')) {
    const token = await getItem(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// One in-flight refresh shared by every 401 that lands while it runs.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;
  try {
    // Bare axios (not apiClient) so this request skips the interceptors and
    // never carries the stale access token.
    const { data } = await axios.post<{ data: { accessToken: string } }>(
      `${BASE_URL}/auth/refresh`,
      { refreshToken },
      { timeout: 15000 }
    );
    const next = data?.data?.accessToken ?? null;
    if (next) await setItem(ACCESS_TOKEN_KEY, next);
    return next;
  } catch {
    return null;
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    const canRetry =
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.startsWith('/auth/');

    if (!canRetry) return Promise.reject(error);

    original._retried = true;
    if (!refreshInFlight) refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    const newToken = await refreshInFlight;

    if (!newToken) {
      await deleteItem(ACCESS_TOKEN_KEY);
      await deleteItem(REFRESH_TOKEN_KEY);
      onAuthFailure?.();
      return Promise.reject(error);
    }

    original.headers = { ...(original.headers as object), Authorization: `Bearer ${newToken}` };
    return apiClient.request(original);
  }
);

export function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
}

export function getApiErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.code;
}
