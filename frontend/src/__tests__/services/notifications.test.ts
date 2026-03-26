import { describe, it, expect } from "vitest";
import {
  isNewSince,
  countNew,
  hasQuoteActivity,
  pendingQuoteCount,
} from "@/services/notifications";

const NOW  = Date.now();
const HOUR = 3_600_000;

// ─── isNewSince ───────────────────────────────────────────────────────────────

describe("isNewSince", () => {
  it("returns false when lastLoginAt is null (first login — suppress noise)", () => {
    expect(isNewSince(NOW, null)).toBe(false);
  });

  it("returns false when lastLoginAt is 0", () => {
    expect(isNewSince(NOW, 0)).toBe(false);
  });

  it("returns true when item was created after lastLoginAt", () => {
    expect(isNewSince(NOW, NOW - HOUR)).toBe(true);
  });

  it("returns false when item was created before lastLoginAt", () => {
    expect(isNewSince(NOW - 2 * HOUR, NOW - HOUR)).toBe(false);
  });

  it("returns false when item was created at exactly lastLoginAt", () => {
    expect(isNewSince(NOW, NOW)).toBe(false);
  });

  it("returns true for an item created 1 ms after lastLoginAt", () => {
    expect(isNewSince(NOW + 1, NOW)).toBe(true);
  });
});

// ─── countNew ────────────────────────────────────────────────────────────────

describe("countNew", () => {
  it("returns 0 for an empty array", () => {
    expect(countNew([], NOW - HOUR)).toBe(0);
  });

  it("returns 0 when lastLoginAt is null", () => {
    const items = [{ createdAt: NOW }, { createdAt: NOW - 10 }];
    expect(countNew(items, null)).toBe(0);
  });

  it("counts only items newer than lastLoginAt", () => {
    const items = [
      { createdAt: NOW - 30 * 60_000 },  // 30 min ago — new
      { createdAt: NOW - 90 * 60_000 },  // 90 min ago — old
      { createdAt: NOW - 10 * 60_000 },  // 10 min ago — new
    ];
    expect(countNew(items, NOW - HOUR)).toBe(2);
  });

  it("returns full length when all items are newer than lastLoginAt", () => {
    const items = [
      { createdAt: NOW - 5 * 60_000 },
      { createdAt: NOW - 2 * 60_000 },
    ];
    expect(countNew(items, NOW - HOUR)).toBe(2);
  });

  it("returns 0 when all items are older than lastLoginAt", () => {
    const items = [
      { createdAt: NOW - 3 * HOUR },
      { createdAt: NOW - 2 * HOUR },
    ];
    expect(countNew(items, NOW - HOUR)).toBe(0);
  });

  it("works with items that have extra fields", () => {
    const items = [
      { createdAt: NOW - 10, id: "a", status: "open" },
      { createdAt: NOW - 2 * HOUR, id: "b", status: "quoted" },
    ];
    expect(countNew(items, NOW - HOUR)).toBe(1);
  });
});

// ─── hasQuoteActivity ─────────────────────────────────────────────────────────

describe("hasQuoteActivity", () => {
  it("returns true when status is 'quoted'", () => {
    expect(hasQuoteActivity("quoted")).toBe(true);
  });

  it("returns false when status is 'open'", () => {
    expect(hasQuoteActivity("open")).toBe(false);
  });

  it("returns false when status is 'accepted'", () => {
    expect(hasQuoteActivity("accepted")).toBe(false);
  });

  it("returns false when status is 'closed'", () => {
    expect(hasQuoteActivity("closed")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasQuoteActivity("")).toBe(false);
  });
});

// ─── pendingQuoteCount ────────────────────────────────────────────────────────

describe("pendingQuoteCount", () => {
  it("returns 0 for an empty array", () => {
    expect(pendingQuoteCount([])).toBe(0);
  });

  it("counts only requests with 'quoted' status", () => {
    const requests = [
      { status: "quoted"   },
      { status: "open"     },
      { status: "quoted"   },
      { status: "accepted" },
      { status: "closed"   },
    ];
    expect(pendingQuoteCount(requests)).toBe(2);
  });

  it("returns 0 when no requests have bids", () => {
    const requests = [{ status: "open" }, { status: "closed" }];
    expect(pendingQuoteCount(requests)).toBe(0);
  });

  it("returns full length when all requests have bids", () => {
    const requests = [{ status: "quoted" }, { status: "quoted" }];
    expect(pendingQuoteCount(requests)).toBe(2);
  });
});
