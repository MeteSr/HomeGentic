/**
 * agentLimiter tests
 *
 * Core behaviour
 *   - Free: 10 calls/week allowed, 11th blocked (weekly reset, not daily)
 *   - ContractorFree tier: first call blocked (limit = 0)
 *   - Basic: 5 calls allowed, 6th blocked (grandfathered tier)
 *   - Pro / ContractorPro: 10 calls allowed, 11th blocked
 *   - Premium: 20 calls allowed, 21st blocked (grandfathered tier)
 *   - count only increments on allowed calls
 *
 * Isolation
 *   - Different principals have independent counters
 *   - Unknown tier strings fall through to a 0 limit (blocked)
 *
 * getCount
 *   - returns 0 for an unseen principal
 *   - reflects recorded calls
 *
 * Structured log output
 *   - emits one JSON line per call to process.stdout
 *   - log fields: ts, event, principal, tier, count, limit, allowed
 */

import { checkAndRecord, getCount, TIER_LIMITS, TIER_PERIOD } from "../agentLimiter";
import type { SubscriptionTier } from "../agentLimiter";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Generate a unique principal so tests don't share counter state. */
let seq = 0;
function uid(): string {
  return `test-principal-${seq++}-${Date.now()}`;
}

/** Call checkAndRecord N times for the given principal / tier. */
function callN(n: number, principal: string, tier: SubscriptionTier) {
  for (let i = 0; i < n; i++) checkAndRecord(principal, tier);
}

// ── Core behaviour ────────────────────────────────────────────────────────────

describe("TIER_LIMITS constants", () => {
  it("Free = 10", ()           => expect(TIER_LIMITS.Free).toBe(10));
  it("Basic = 5", ()           => expect(TIER_LIMITS.Basic).toBe(5));
  it("Pro = 10", ()            => expect(TIER_LIMITS.Pro).toBe(10));
  it("Premium = 20", ()        => expect(TIER_LIMITS.Premium).toBe(20));
  it("ContractorFree = 0", ()  => expect(TIER_LIMITS.ContractorFree).toBe(0));
  it("ContractorPro = 10", ()  => expect(TIER_LIMITS.ContractorPro).toBe(10));
});

describe("TIER_PERIOD constants", () => {
  it("Free resets weekly", ()  => expect(TIER_PERIOD.Free).toBe("week"));
  it("every other tier resets daily", () => {
    expect(TIER_PERIOD.Basic).toBe("day");
    expect(TIER_PERIOD.Pro).toBe("day");
    expect(TIER_PERIOD.Premium).toBe("day");
    expect(TIER_PERIOD.ContractorFree).toBe("day");
    expect(TIER_PERIOD.ContractorPro).toBe("day");
  });
});

describe("Free tier — 10 calls/week", () => {
  it("allows exactly 10 calls", () => {
    const p = uid();
    callN(10, p, "Free");
    expect(getCount(p, "Free")).toBe(10);
  });

  it("blocks the 11th call", () => {
    const p = uid();
    callN(10, p, "Free");
    const r = checkAndRecord(p, "Free");
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(10); // count does not increment when blocked
    expect(r.limit).toBe(10);
  });
});

describe("ContractorFree tier — no agent access", () => {
  it("blocks the first call", () => {
    const p = uid();
    const result = checkAndRecord(p, "ContractorFree");
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
    expect(result.count).toBe(0);
  });
});

describe("Basic tier — 5 calls/day", () => {
  it("allows exactly 5 calls", () => {
    const p = uid();
    for (let i = 1; i <= 5; i++) {
      const r = checkAndRecord(p, "Basic");
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
    }
  });

  it("blocks the 6th call", () => {
    const p = uid();
    callN(5, p, "Basic");
    const r = checkAndRecord(p, "Basic");
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(5); // count does not increment when blocked
    expect(r.limit).toBe(5);
  });

  it("count does not increment when blocked", () => {
    const p = uid();
    callN(5, p, "Basic");
    checkAndRecord(p, "Basic"); // blocked
    checkAndRecord(p, "Basic"); // blocked again
    expect(getCount(p, "Basic")).toBe(5);
  });
});

describe("Pro tier — 10 calls/day", () => {
  it("allows exactly 10 calls", () => {
    const p = uid();
    callN(10, p, "Pro");
    expect(getCount(p, "Pro")).toBe(10);
  });

  it("blocks the 11th call", () => {
    const p = uid();
    callN(10, p, "Pro");
    const r = checkAndRecord(p, "Pro");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(10);
  });
});

describe("ContractorPro tier — 10 calls/day", () => {
  it("allows 10 calls and blocks the 11th", () => {
    const p = uid();
    callN(10, p, "ContractorPro");
    const r = checkAndRecord(p, "ContractorPro");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(10);
  });
});

describe("Premium tier — 20 calls/day", () => {
  it("allows exactly 20 calls", () => {
    const p = uid();
    callN(20, p, "Premium");
    expect(getCount(p, "Premium")).toBe(20);
  });

  it("blocks the 21st call", () => {
    const p = uid();
    callN(20, p, "Premium");
    const r = checkAndRecord(p, "Premium");
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(20);
  });
});

// ── Isolation ─────────────────────────────────────────────────────────────────

describe("Principal isolation", () => {
  it("different principals have independent counters", () => {
    const a = uid();
    const b = uid();
    callN(5, a, "Basic");
    // a is exhausted; b should still be allowed
    const r = checkAndRecord(b, "Basic");
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });
});

describe("Unknown tier", () => {
  it("treats an unrecognised tier string as a 0 limit (blocked)", () => {
    const p = uid();
    const r = checkAndRecord(p, "Enterprise" as SubscriptionTier);
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(0);
  });
});

// ── getCount ──────────────────────────────────────────────────────────────────

describe("getCount", () => {
  it("returns 0 for an unseen principal", () => {
    expect(getCount(uid(), "Pro")).toBe(0);
  });

  it("returns the current recorded count", () => {
    const p = uid();
    callN(3, p, "Pro");
    expect(getCount(p, "Pro")).toBe(3);
  });
});

// ── resetsAt ──────────────────────────────────────────────────────────────────

describe("resetsAt field", () => {
  it("is a valid ISO timestamp in the future", () => {
    const p = uid();
    const { resetsAt } = checkAndRecord(p, "Basic");
    const ts = new Date(resetsAt).getTime();
    expect(ts).toBeGreaterThan(Date.now());
  });

  it("is always midnight UTC (HH:MM:SS = 00:00:00)", () => {
    const p = uid();
    const { resetsAt } = checkAndRecord(p, "Basic");
    expect(resetsAt).toMatch(/T00:00:00\.000Z$/);
  });

  it("Free's resetsAt lands on a Monday, not just the next midnight", () => {
    const p = uid();
    const { resetsAt } = checkAndRecord(p, "Free");
    const d = new Date(resetsAt);
    expect(resetsAt).toMatch(/T00:00:00\.000Z$/);
    expect(d.getUTCDay()).toBe(1); // 1 = Monday
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── Structured log output ─────────────────────────────────────────────────────

describe("stdout JSON-lines logging", () => {
  let writtenLines: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    writtenLines = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string) => {
      writtenLines.push(chunk);
      return true;
    };
  });

  afterEach(() => {
    (process.stdout as any).write = originalWrite;
  });

  it("emits one JSON line per call", () => {
    const p = uid();
    checkAndRecord(p, "Pro");
    checkAndRecord(p, "Pro");
    expect(writtenLines).toHaveLength(2);
    writtenLines.forEach((line) => expect(() => JSON.parse(line)).not.toThrow());
  });

  it("allowed call: event fields are correct", () => {
    const p = uid();
    checkAndRecord(p, "Pro");
    const entry = JSON.parse(writtenLines[0]);
    expect(entry.event).toBe("agent_call");
    expect(entry.principal).toBe(p);
    expect(entry.tier).toBe("Pro");
    expect(entry.allowed).toBe(true);
    expect(entry.count).toBe(1);
    expect(entry.limit).toBe(10);
    expect(typeof entry.ts).toBe("string");
  });

  it("blocked call: allowed=false and count is not incremented", () => {
    const p = uid();
    callN(5, p, "Basic");
    writtenLines = []; // clear previous lines
    checkAndRecord(p, "Basic"); // this one is blocked
    const entry = JSON.parse(writtenLines[0]);
    expect(entry.allowed).toBe(false);
    expect(entry.count).toBe(5); // still 5, not 6
    expect(entry.limit).toBe(5);
  });

  it("Free tier call: allowed=true with limit=10", () => {
    const p = uid();
    checkAndRecord(p, "Free");
    const entry = JSON.parse(writtenLines[0]);
    expect(entry.allowed).toBe(true);
    expect(entry.limit).toBe(10);
  });

  it("ContractorFree tier call: allowed=false with limit=0", () => {
    const p = uid();
    checkAndRecord(p, "ContractorFree");
    const entry = JSON.parse(writtenLines[0]);
    expect(entry.allowed).toBe(false);
    expect(entry.limit).toBe(0);
  });
});
