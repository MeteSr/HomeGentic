import { describe, it, expect, beforeEach, vi } from "vitest";

// STEPS read canister ids at import time, so set them before the module loads.
const calls = vi.hoisted(() => {
  const ids = ["JOB", "PHOTO", "BILLS", "RECURRING", "MAINTENANCE", "SENSOR", "REPORT", "QUOTE",
               "LISTING", "CONTRACTOR", "AGENT", "MARKET", "PROPERTY", "AUTH", "PAYMENT"];
  for (const id of ids) (process.env as any)[`${id}_CANISTER_ID`] = id.toLowerCase();
  return { order: [] as string[], failOn: null as string | null };
});

vi.mock("@/services/lazyActor", () => ({
  lazyActor: (_idl: unknown, id: string) => async () => ({
    deleteMyData: async () => {
      calls.order.push(id);
      return id === calls.failOn ? { err: { NotAuthorized: null } } : { ok: 1n };
    },
  }),
}));
vi.mock("@/services/voiceAgentHeaders", () => ({
  voiceAgentFetch: (url: string, init?: RequestInit) => (global.fetch as any)(url, init),
}));
vi.mock("@/services/notificationPrefs", () => ({
  forgetNotificationAccount: vi.fn(async () => { calls.order.push("relay"); }),
}));

import { accountDeletionService } from "@/services/accountDeletion";

beforeEach(() => {
  calls.order = [];
  calls.failOn = null;
  global.fetch = vi.fn(async () => {
    calls.order.push("stripe");
    return new Response(JSON.stringify({ cancelled: 1, periodEnd: null }), { status: 200 });
  }) as any;
});

describe("accountDeletionService.deleteMyAccount", () => {
  it("stops Stripe first, deletes dependents, then property, then auth last", async () => {
    await accountDeletionService.deleteMyAccount();
    expect(calls.order[0]).toBe("stripe");
    expect(calls.order[1]).toBe("relay");
    expect(calls.order.slice(-2)).toEqual(["property", "auth"]);
    expect(calls.order).toContain("job");
    expect(calls.order).toContain("photo");
    expect(calls.order).toContain("market");
    expect(calls.order).not.toContain("payment");
    expect((global.fetch as any).mock.calls[0][0]).toMatch(/\/api\/stripe\/cancel-subscription$/);
  });

  it("stops at the first failing step and keeps the profile", async () => {
    calls.failOn = "photo";
    await expect(accountDeletionService.deleteMyAccount()).rejects.toThrow(/photos: NotAuthorized/);
    expect(calls.order).not.toContain("property");
    expect(calls.order).not.toContain("auth");
  });

  it("deletes nothing when Stripe can't stop the renewal", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Payment provider error" }), { status: 502 })) as any;
    await expect(accountDeletionService.deleteMyAccount()).rejects.toThrow(/subscription/);
    expect(calls.order).toEqual([]);
  });
});
