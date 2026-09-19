/**
 * Same signal api/client.ts's retry interceptor uses: an axios error with no
 * `response` never reached the server (dropped connection, DNS, timeout) —
 * as opposed to a 4xx/5xx the server actually sent.
 */
export function isNetworkError(err: unknown): boolean {
  return !(err as { response?: unknown } | null | undefined)?.response;
}

/**
 * What a failed send means for a queued edit:
 *  - network / retryable: it may simply not have arrived (or the server is
 *    briefly unwell, e.g. mid-deploy) — keep it queued and try again later.
 *  - auth: the session needs refreshing; not a verdict on the edit itself.
 *  - permanent: the server looked at it and said no (validation, wrong state).
 */
export type ErrorKind = 'network' | 'retryable' | 'auth' | 'permanent';

export function classifyError(err: unknown): ErrorKind {
  const status = (err as { response?: { status?: number } } | null | undefined)?.response?.status;
  if (status === undefined) return 'network';
  if (status === 401) return 'auth';
  if (status === 408 || status === 429 || status >= 500) return 'retryable';
  return 'permanent';
}

export const isRetryable = (err: unknown) => {
  const kind = classifyError(err);
  return kind === 'network' || kind === 'retryable';
};

/** An error whose `userMessage` is safe to show as-is (see getApiErrorMessage). */
export function offlineUnavailableError(action: string): Error & { userMessage: string } {
  const userMessage = `You need a connection to ${action}. Please try again when you have signal.`;
  return Object.assign(new Error(userMessage), { userMessage });
}

export function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string } | null | undefined;
  return e?.response?.data?.error?.message ?? e?.message ?? 'Something went wrong.';
}
