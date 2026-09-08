// Thin fetch wrapper matching the Unified Backend Spec's response envelope:
//   success -> { data: ... } or { data: [...], meta: { total } }
//   error   -> { error: { code, message, field } }
// See docs/api-spec.md §1.1 and CampaignBuddy_Unified_Backend_Spec.md §3.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/admin/v1';

let accessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  accessToken = token;
  if (token) localStorage.setItem('cb_access_token', token);
  else localStorage.removeItem('cb_access_token');
}

export function loadStoredToken() {
  accessToken = localStorage.getItem('cb_access_token');
  return accessToken;
}

export function registerUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

class ApiError extends Error {
  constructor(code, message, field, status) {
    super(message || code || 'Request failed');
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

function buildQuery(params) {
  if (!params) return '';
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (usable.length === 0) return '';
  return '?' + new URLSearchParams(usable).toString();
}

async function request(method, path, { body, query, signal } = {}) {
  const url = `${BASE_URL}${path}${buildQuery(query)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (networkErr) {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Is the backend running?', null, 0);
  }

  if (res.status === 204) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const err = payload?.error || {};
    throw new ApiError(err.code || `HTTP_${res.status}`, err.message, err.field, res.status);
  }

  return payload;
}

async function requestForm(method, path, formData, { signal } = {}) {
  const url = `${BASE_URL}${path}`;
  // No Content-Type header here on purpose — the browser sets
  // multipart/form-data with the correct boundary itself. Setting it
  // manually breaks the upload.
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: formData, signal });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Is the backend running?', null, 0);
  }

  if (res.status === 204) return null;
  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const err = payload?.error || {};
    throw new ApiError(err.code || `HTTP_${res.status}`, err.message, err.field, res.status);
  }
  return payload;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
  // For file uploads — pass a FormData instance, not a plain object.
  postForm: (path, formData, opts) => requestForm('POST', path, formData, opts),
};

export { ApiError };
