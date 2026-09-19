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
import axios, {
  AxiosAdapter,
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { getItem, setItem, deleteItem } from './secureStore';
import type { ApiErrorBody } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.campaignbuddy.lk/v1';

export const ACCESS_TOKEN_KEY = 'cb_access_token';
export const REFRESH_TOKEN_KEY = 'cb_refresh_token';

// Field-rep devices run on flaky mobile data — the app must stay usable on 2G
// (EDGE: ~100 kbps, 600 ms+ RTT, multi-second stalls) and on some Wi-Fi
// networks that blackhole the IPv6 leg to the API while IPv4 works.
// On-device testing showed RN's XHR and axios's bundled adapters (which route
// the body through XMLHttpRequest or `new Request(...)`) intermittently stall
// forever against the production API while a plain `fetch(url, init)` always
// connects — so this adapter calls plain fetch directly.
// Retries network-level failures (no response ever arrived) once.
// On-device testing on a broken-IPv6 Wi-Fi showed the first connect attempt to
// the API host blackholes and Android only falls through to the (working) IPv4
// address after ~63s of TCP SYN retransmits, then the request succeeds. The
// timeout has to survive that window; with Cloudflare's "IPv6 Compatibility:
// off" on the zone, requests are instant from the start.
const REQUEST_TIMEOUT_MS = 75_000;

/**
 * Minimal axios adapter on top of React Native's plain global `fetch`.
 * Bypasses the XHR/Request polyfill paths that stall on some device networks.
 */
const plainFetchAdapter: AxiosAdapter = async (config) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeout ?? REQUEST_TIMEOUT_MS);
  const signal = config.signal;
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener?.('abort', () => ctrl.abort(), { once: true });
  }

  async function settleWith(res: Response, url: string): Promise<AxiosResponse> {
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    const raw = await res.text();
    let data: unknown = raw;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body — keep text */ }

    const response: AxiosResponse = {
      data, status: res.status, statusText: res.statusText ?? '', headers, config, request: url,
    };
    const valid = config.validateStatus?.(res.status) ?? (res.status >= 200 && res.status < 300);
    if (!valid) {
      throw new AxiosError(`Request failed with status code ${res.status}`, AxiosError.ERR_BAD_REQUEST, config, url, response);
    }
    return response;
  }

  try {
    const headers: Record<string, string> = {};
    (config.headers as { toJSON?: () => Record<string, string> })?.toJSON?.()
      ? Object.assign(headers, (config.headers as { toJSON: () => Record<string, string> }).toJSON())
      : Object.assign(headers, config.headers as Record<string, string>);
    const uri = axios.getUri(config);
    const res = await fetch(uri, {
      method: (config.method ?? 'get').toUpperCase(),
      headers,
      body: (config.data as string | undefined) ?? null,
      signal: ctrl.signal,
    });
    return await settleWith(res, uri);
  } catch (e) {
    if (e instanceof AxiosError && e.response) throw e;
    const message = e instanceof Error ? e.message : String(e);
    throw new AxiosError(`fetch failed: ${message}`, message && ctrl.signal.aborted ? AxiosError.ECONNABORTED : AxiosError.ERR_NETWORK, config);
  } finally {
    clearTimeout(timer);
  }
};

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  adapter: plainFetchAdapter,
});

/**
 * Reuse trick: on networks where the first connection attempt to the API host
 * stalls on a dead IPv6 address (then falls through to IPv4 after ~63s), the
 * successful connection is pooled and reused. A cheap background probe while
 * the user is on/typing into the Login screen means the real requests never
 * wait out the stall. Safe to fire repeatedly; fire-and-forget.
 */
export function warmUpApiConnection(): void {
  fetch(`${BASE_URL}/health`, { method: 'GET' }).catch(() => {
    /* best-effort only — anything this does for us is free */
  });
}

// Set by AuthContext — called when the session is unrecoverable (refresh failed).
let onAuthFailure: (() => void) | null = null;
export function registerAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

apiClient.interceptors.request.use(async (config) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    (config as AxiosRequestConfig & { _start?: number })._start = Date.now();
  }
  if (!config.url?.startsWith('/auth/')) {
    const token = await getItem(ACCESS_TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// One in-flight refresh shared by every 401 that lands while it runs.
interface RefreshResult {
  token: string | null;
  /** The refresh call never reached the server — the session may still be fine, so don't wipe it. */
  networkFailure: boolean;
}
let refreshInFlight: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = await getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return { token: null, networkFailure: false };
  try {
    // Bare axios (not apiClient) so this request skips the interceptors and
    // never carries the stale access token.
    const { data } = await axios.post<{ data: { accessToken: string } }>(
      `${BASE_URL}/auth/refresh`,
      { refreshToken },
      { timeout: REQUEST_TIMEOUT_MS, adapter: plainFetchAdapter }
    );
    const next = data?.data?.accessToken ?? null;
    if (next) await setItem(ACCESS_TOKEN_KEY, next);
    return { token: next, networkFailure: false };
  } catch (err) {
    return { token: null, networkFailure: !(err as AxiosError).response };
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean; _netRetried?: boolean })
      | undefined;
    const status = error.response?.status;

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const cfg = original as (AxiosRequestConfig & { _start?: number }) | undefined;
      console.log('[api] request failed after', Date.now() - (cfg?._start ?? Date.now()), 'ms');
    }

    // Network-level failure (no response at all — timed out, dropped
    // connection). The request never reached the server, so retrying once is
    // safe and often succeeds on flaky mobile data.
    const canRetryNetwork =
      !status && original && !original._netRetried && !original.url?.startsWith('/auth/refresh');

    if (canRetryNetwork) {
      original._netRetried = true;
      await new Promise((r) => setTimeout(r, 1_000));
      return apiClient.request(original);
    }

    const canRetry =
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.startsWith('/auth/');

    if (!canRetry) return Promise.reject(error);

    original._retried = true;
    if (!refreshInFlight) refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    const { token: newToken, networkFailure } = await refreshInFlight;

    if (!newToken) {
      // Lost the connection mid-refresh: keep the session and fail as a plain
      // network error (no `response`) so callers queue/retry instead of treating
      // it as an auth rejection.
      if (networkFailure) {
        return Promise.reject(
          new AxiosError('Network Error', AxiosError.ERR_NETWORK, original as InternalAxiosRequestConfig)
        );
      }
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
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    console.log('[api] error', {
      url: axiosError?.config?.url,
      baseURL: axiosError?.config?.baseURL,
      status: axiosError?.response?.status,
      data: JSON.stringify(axiosError?.response?.data),
      message: axiosError?.message,
    });
  }
  const userMessage = (error as { userMessage?: string } | null)?.userMessage;
  if (userMessage) return userMessage;
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
}

export function getApiErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<ApiErrorBody>;
  return axiosError.response?.data?.error?.code;
}
