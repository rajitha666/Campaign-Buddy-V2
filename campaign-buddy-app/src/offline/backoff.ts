const BASE_MS = 30_000;
const MAX_MS = 120_000;

/** Wait before the next automatic sync attempt after `failures` consecutive failed passes. */
export const retryDelayMs = (failures: number) => Math.min(BASE_MS * 2 ** Math.max(failures, 0), MAX_MS);
