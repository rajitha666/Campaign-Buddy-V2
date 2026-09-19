import { describe, it, expect } from 'vitest';
import { isNetworkError, classifyError, isRetryable, errorMessage, offlineUnavailableError } from './networkError';

describe('isNetworkError', () => {
  it('is true when the request never got a response (dropped connection, timeout)', () => {
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
    expect(isNetworkError({ message: 'Network Error' })).toBe(true);
    expect(isNetworkError(undefined)).toBe(true);
  });

  it('is false when the server actually responded, whatever the status', () => {
    expect(isNetworkError({ response: { status: 409 } })).toBe(false);
    expect(isNetworkError({ response: { status: 401 } })).toBe(false);
    expect(isNetworkError({ response: { status: 500 } })).toBe(false);
  });
});

describe('classifyError', () => {
  it('no response → network', () => {
    expect(classifyError(new Error('x'))).toBe('network');
  });

  it('5xx, 429 and 408 are transient → retryable (a deploy or overload is not a rejected edit)', () => {
    for (const status of [500, 502, 503, 504, 429, 408]) {
      expect(classifyError({ response: { status } })).toBe('retryable');
    }
  });

  it('401 is an auth problem, not a verdict on the edit', () => {
    expect(classifyError({ response: { status: 401 } })).toBe('auth');
  });

  it('other 4xx are the server refusing the edit → permanent', () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(classifyError({ response: { status } })).toBe('permanent');
    }
  });
});

describe('isRetryable', () => {
  it('is true for network and transient server errors only', () => {
    expect(isRetryable(new Error('x'))).toBe(true);
    expect(isRetryable({ response: { status: 503 } })).toBe(true);
    expect(isRetryable({ response: { status: 401 } })).toBe(false);
    expect(isRetryable({ response: { status: 422 } })).toBe(false);
  });
});

describe('offlineUnavailableError', () => {
  it('carries a sentence that is safe to show the user', () => {
    expect(offlineUnavailableError('check in').userMessage).toBe(
      'You need a connection to check in. Please try again when you have signal.'
    );
  });
});

describe('errorMessage', () => {
  it("prefers the server's own sentence", () => {
    expect(errorMessage({ response: { data: { error: { message: 'Check in first' } } }, message: 'Request failed' })).toBe(
      'Check in first'
    );
  });

  it('falls back to the error message, then a default', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(undefined)).toBe('Something went wrong.');
  });
});
