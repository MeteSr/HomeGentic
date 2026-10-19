/**
 * Agent session tokens: how a client proves who it is to the voice Worker and
 * the notification / IoT relays without asserting a principal.
 *
 * The client asks the auth canister for a token (auth.issueAgentSession(), a
 * call the IC authenticates with the user's identity) and sends it in the
 * x-agent-session header. A server resolves it back to the owning principal
 * with auth.resolveAgentSession() and never trusts a principal in the body.
 *
 * Dependency-free so the web app, the mobile app, the Worker and the Node
 * relays can all import it; callers pass in the platform-specific pieces
 * (how to issue, how to hash, how to resolve).
 */

export const SESSION_HEADER = "x-agent-session";

const TOKEN_RE = /^hgs_[0-9a-f]{64}$/;

/** Whether a value has the shape of a canister-issued session token. */
export function isSessionToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

// ── Client side ──────────────────────────────────────────────────────────────

export interface IssuedSession {
  token: string;
  expiresAtMs: number;
}

export interface SessionTokenCache {
  /** A live token, or null when one can't be issued. */
  get(): Promise<string | null>;
  /** Forget the cached token (on sign-out, or after a server rejects it). */
  clear(): void;
}

/**
 * Keeps one token in memory, reused until `refreshMarginMs` before it expires
 * and re-issued when `owner()` changes. Concurrent callers share one issue.
 */
export function createSessionTokenCache(opts: {
  issue: () => Promise<IssuedSession | null>;
  owner?: () => string | null;
  refreshMarginMs?: number;
  onError?: (err: unknown) => void;
}): SessionTokenCache {
  const margin = opts.refreshMarginMs ?? 5 * 60_000;
  let cached: (IssuedSession & { owner: string | null }) | null = null;
  let inflight: Promise<string | null> | null = null;

  return {
    get() {
      const owner = opts.owner ? opts.owner() : null;
      if (cached && cached.owner === owner && cached.expiresAtMs - margin > Date.now()) {
        return Promise.resolve(cached.token);
      }
      if (!inflight) {
        // Via then() so an issuer that throws synchronously also lands in catch().
        inflight = Promise.resolve()
          .then(() => opts.issue())
          .then((s) => {
            cached = s ? { ...s, owner } : null;
            return s ? s.token : null;
          })
          .catch((err) => {
            opts.onError?.(err);
            return null;
          })
          .finally(() => { inflight = null; });
      }
      return inflight;
    },
    clear() {
      cached = null;
    },
  };
}

// ── Server side (Node relays) ────────────────────────────────────────────────

/** The parts of an Express request the resolver reads. */
export interface SessionRequest {
  header(name: string): string | undefined;
  body?: unknown;
}

export interface RequestPrincipalResolver {
  /** The verified principal behind the request's session token, or null (fail closed). */
  requestPrincipal(req: SessionRequest, resolve?: (token: string) => Promise<string | null>): Promise<string | null>;
  clearCache(): void;
}

/**
 * Positive lookups are cached briefly under the token's hash (never the token)
 * to spare the canister; failures aren't cached and fail closed. When
 * `trustBodyPrincipal()` is true (local dev with no auth canister) the body's
 * principal is accepted instead.
 */
export function createRequestPrincipalResolver(opts: {
  resolve: (token: string) => Promise<string | null>;
  hash: (token: string) => string;
  trustBodyPrincipal: () => boolean;
  ttlMs?: number;
  maxEntries?: number;
  onError?: (err: unknown) => void;
}): RequestPrincipalResolver {
  const ttlMs = opts.ttlMs ?? 120_000;
  const maxEntries = opts.maxEntries ?? 10_000;
  const cache = new Map<string, { principal: string; expiresAt: number }>();

  return {
    async requestPrincipal(req, resolve = opts.resolve) {
      if (opts.trustBodyPrincipal()) {
        const p = (req.body as { principal?: unknown } | undefined)?.principal;
        return typeof p === "string" && p.length > 0 ? p : null;
      }

      const token = req.header(SESSION_HEADER) ?? "";
      if (!isSessionToken(token)) return null;

      const key = opts.hash(token);
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.principal;

      let principal: string | null;
      try {
        principal = await resolve(token);
      } catch (err) {
        opts.onError?.(err);
        return null;
      }
      if (principal) {
        if (cache.size >= maxEntries) cache.clear();
        cache.set(key, { principal, expiresAt: Date.now() + ttlMs });
      }
      return principal;
    },
    clearCache() {
      cache.clear();
    },
  };
}
