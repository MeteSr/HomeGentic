/**
 * RateLimiterDO — a Durable Object that holds one fixed-window counter.
 *
 * The Worker addresses one instance per limiter key (`idFromName(key)`, e.g.
 * `rl:<ip>:<minute>` or `chat:<principal>:<date>`), so every request for the
 * same key lands on the same single-threaded object. Each operation runs
 * through an in-object promise chain (on top of the runtime's input gates),
 * so check-and-increment is atomic: a parallel burst can never exceed the
 * limit, unlike the old Workers KV get→put path (F-10).
 *
 * Window expiry is timestamp-based (`expiresAt` stored with the count) and an
 * alarm deletes the storage after the window closes, so idle keys cost nothing.
 *
 * Protocol (POST, JSON body):
 *   { op: "hit",     limit, ttlMs } → { allowed, count }   count += 1 unless count >= limit
 *   { op: "peek" }                  → { count, expiresAt }  expiresAt = 0 when there is no live window
 *   { op: "release" }               → { ok: true }         forget the key (used to undo a dedupe claim)
 *   { op: "add", amount, ttlMs }    → { count }            count += amount, no limit (token budgets)
 *   { op: "extend", ttlMs }         → { count, expiresAt }  count ≥ 1 and the window ends no sooner
 *                                                           than now + ttlMs (backoff blocks)
 * A dedupe ("send at most once") is `hit` with limit 1.
 */

export interface CounterStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

export interface CounterState {
  storage: CounterStorage;
}

interface Stored { count: number; expiresAt: number }

export type CounterOp =
  | { op: "hit"; limit: number; ttlMs: number }
  | { op: "peek" }
  | { op: "release" }
  | { op: "add"; amount: number; ttlMs: number }
  | { op: "extend"; ttlMs: number };

const MAX_TTL_MS = 400 * 86_400_000;

export class RateLimiterDO {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly state: CounterState, _env?: unknown) {}

  /** Serialise every operation on this object. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async current(now: number): Promise<Stored | null> {
    const s = await this.state.storage.get<Stored>("c");
    if (!s || s.expiresAt <= now) return null;
    return s;
  }

  /** Atomic check-and-increment. Exposed for unit tests and for apply(). */
  hit(limit: number, ttlMs: number, now = Date.now()): Promise<{ allowed: boolean; count: number }> {
    return this.run(async () => {
      const lim = Math.max(0, Math.floor(limit));
      const ttl = Math.min(Math.max(1_000, Math.floor(ttlMs)), MAX_TTL_MS);
      const cur = await this.current(now);
      const count = cur?.count ?? 0;
      if (count >= lim) return { allowed: false, count };
      const expiresAt = cur?.expiresAt ?? now + ttl;
      await this.state.storage.put<Stored>("c", { count: count + 1, expiresAt });
      if (!cur) await this.state.storage.setAlarm(expiresAt);
      return { allowed: true, count: count + 1 };
    });
  }

  peek(now = Date.now()): Promise<{ count: number; expiresAt: number }> {
    return this.run(async () => {
      const cur = await this.current(now);
      return { count: cur?.count ?? 0, expiresAt: cur?.expiresAt ?? 0 };
    });
  }

  /** Add `amount` (≥ 0) to the window's count, opening a window if none is live. */
  add(amount: number, ttlMs: number, now = Date.now()): Promise<{ count: number }> {
    return this.run(async () => {
      const n   = Math.max(0, Math.floor(amount));
      const ttl = Math.min(Math.max(1_000, Math.floor(ttlMs)), MAX_TTL_MS);
      const cur = await this.current(now);
      const expiresAt = cur?.expiresAt ?? now + ttl;
      const count = (cur?.count ?? 0) + n;
      await this.state.storage.put<Stored>("c", { count, expiresAt });
      if (!cur) await this.state.storage.setAlarm(expiresAt);
      return { count };
    });
  }

  /** Make the window live until at least now + ttlMs (never shortens it). */
  extend(ttlMs: number, now = Date.now()): Promise<{ count: number; expiresAt: number }> {
    return this.run(async () => {
      const ttl = Math.min(Math.max(1_000, Math.floor(ttlMs)), MAX_TTL_MS);
      const cur = await this.current(now);
      const expiresAt = Math.max(cur?.expiresAt ?? 0, now + ttl);
      const count = Math.max(1, cur?.count ?? 0);
      await this.state.storage.put<Stored>("c", { count, expiresAt });
      await this.state.storage.setAlarm(expiresAt);
      return { count, expiresAt };
    });
  }

  release(): Promise<{ ok: true }> {
    return this.run(async () => { await this.state.storage.deleteAll(); return { ok: true as const }; });
  }

  async apply(op: CounterOp): Promise<unknown> {
    switch (op?.op) {
      case "hit":     return this.hit(Number(op.limit), Number(op.ttlMs));
      case "peek":    return this.peek();
      case "release": return this.release();
      case "add":     return this.add(Number(op.amount), Number(op.ttlMs));
      case "extend":  return this.extend(Number(op.ttlMs));
      default:        throw new Error("unknown op");
    }
  }

  async fetch(request: Request): Promise<Response> {
    let op: CounterOp;
    try {
      op = await request.json() as CounterOp;
      return new Response(JSON.stringify(await this.apply(op)), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
    }
  }

  /** Window closed: drop the counter (a late alarm never wipes a fresh window). */
  async alarm(): Promise<void> {
    await this.run(async () => {
      const s = await this.state.storage.get<Stored>("c");
      if (s && s.expiresAt > Date.now()) { await this.state.storage.setAlarm(s.expiresAt); return; }
      await this.state.storage.deleteAll();
    });
  }
}

// ── Worker-side client ──────────────────────────────────────────────────────

/** Minimal shape of a DurableObjectNamespace that the client needs. */
export interface CounterNamespace {
  idFromName(name: string): unknown;
  get(id: any): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

async function call<T>(ns: CounterNamespace, key: string, op: CounterOp): Promise<T> {
  const stub = ns.get(ns.idFromName(key));
  const res = await stub.fetch("https://rate-limiter.internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(op),
  });
  if (!res.ok) throw new Error(`rate limiter DO error ${res.status}`);
  return await res.json() as T;
}

export function doHit(ns: CounterNamespace, key: string, limit: number, ttlSeconds: number) {
  return call<{ allowed: boolean; count: number }>(ns, key, { op: "hit", limit, ttlMs: ttlSeconds * 1000 });
}

export async function doPeek(ns: CounterNamespace, key: string): Promise<number> {
  return (await call<{ count: number }>(ns, key, { op: "peek" })).count;
}

export async function doPeekFull(ns: CounterNamespace, key: string): Promise<{ count: number; expiresAt: number }> {
  return call<{ count: number; expiresAt: number }>(ns, key, { op: "peek" });
}

export async function doAdd(ns: CounterNamespace, key: string, amount: number, ttlSeconds: number): Promise<number> {
  return (await call<{ count: number }>(ns, key, { op: "add", amount, ttlMs: ttlSeconds * 1000 })).count;
}

export async function doExtend(ns: CounterNamespace, key: string, ttlSeconds: number): Promise<{ count: number; expiresAt: number }> {
  return call<{ count: number; expiresAt: number }>(ns, key, { op: "extend", ttlMs: ttlSeconds * 1000 });
}

export async function doRelease(ns: CounterNamespace, key: string): Promise<void> {
  await call(ns, key, { op: "release" });
}
