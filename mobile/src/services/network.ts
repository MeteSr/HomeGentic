/**
 * Network helpers: telling a dropped connection apart from a real error, and
 * giving up on a call that hangs on a slow network.
 */

/**
 * True for errors that mean the request couldn't reach the network at all
 * (offline, DNS). Timeouts don't count: the call may still have gone through,
 * and queueing it again would save it twice.
 */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /network request failed|failed to fetch|fetch failed|network error|ENOTFOUND|ECONNREFUSED/i.test(msg);
}

export class TimeoutError extends Error {
  constructor(message = "This is taking too long. Check your connection and try again.") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Rejects with TimeoutError if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
