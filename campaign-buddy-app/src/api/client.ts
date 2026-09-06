/**
 * Shared axios instance for every endpoint module in this folder.
 *
 * TODO(backend): set EXPO_PUBLIC_API_BASE_URL in your .env / eas.json build
 * profiles. Falls back to a local dev placeholder so the app doesn't crash
 * on first run before that's configured.
 *
 * Auth: every request except /auth/* gets `Authorization: Bearer <token>`
 * attached automatically (see spec §1 — Auth). The token is read from
 * SecureStore rather than kept in JS memory only, so it survives app restarts.
 * AuthContext is responsible for writing/clearing it there on login/logout.
 */
import axios, { AxiosError } from 'axios';
import { getItem } from './secureStore';
import type { ApiErrorBody } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.campaignbuddy.app/v1';

export const ACCESS_TOKEN_KEY = 'cb_access_token';
export const REFRESH_TOKEN_KEY = 'cb_refresh_token';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use(async (config) => {
  // /auth/login and /auth/forgot-password don't need a token; harmless to
  // attach one anyway since the backend ignores auth on those routes, but
  // we skip it to avoid sending a stale token by accident.
  if (!config.url?.startsWith('/auth/')) {
    const token = await getItem(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Extracts the backend's `{ error: { code, message } }` shape into something
 * screens can show directly. TODO(dev): wire a real refresh-token retry here
 * once /auth/refresh is live — for now a 401 just surfaces as an error and
 * AuthContext should react by logging the user out (see AuthContext.tsx).
 */
export function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
}

export function getApiErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.code;
}
