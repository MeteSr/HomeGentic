import { describe, it, expect, vi, beforeEach } from "vitest";

const { actor } = vi.hoisted(() => ({
  actor: {
    attachUsageSummary: vi.fn(),
    removeUsageSummary: vi.fn(),
    getUsageSummary:    vi.fn(),
  },
}));

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => actor) } }));

import { quoteService } from "@/services/quote";
import type { UsageSummary } from "@/services/quoteUsage";

const summary: UsageSummary = {
  asOf: "2026-09-15",
  series: [
    { category: "Electric", unit: "kWh", months: [
      { month: "2026-07", amountCents: 21_400, usage: 1480 },
      { month: "2026-08", amountCents: 23_900, usage: null },
    ] },
    { category: "Gas", unit: null, months: [{ month: "2026-08", amountCents: 3_100, usage: null }] },
  ],
};

const candid = {
  asOf: "2026-09-15",
  series: [
    { category: { Electric: null }, unit: ["kWh"], months: [
      { month: "2026-07", amountCents: 21_400n, usage: [1480] },
      { month: "2026-08", amountCents: 23_900n, usage: [] },
    ] },
    { category: { Gas: null }, unit: [], months: [{ month: "2026-08", amountCents: 3_100n, usage: [] }] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("quoteService usage", () => {
  it("attachUsage encodes the summary in Candid form", async () => {
    actor.attachUsageSummary.mockResolvedValue({ ok: null });
    await quoteService.attachUsage("REQ_1", summary);
    expect(actor.attachUsageSummary).toHaveBeenCalledWith("REQ_1", candid);
  });

  it("attachUsage surfaces the canister's reason", async () => {
    actor.attachUsageSummary.mockResolvedValue({ err: { InvalidInput: "category not relevant to this service type" } });
    await expect(quoteService.attachUsage("REQ_1", summary)).rejects.toThrow("not relevant");
  });

  it("getUsage decodes a shared summary", async () => {
    actor.getUsageSummary.mockResolvedValue({ ok: [candid] });
    expect(await quoteService.getUsage("REQ_1")).toEqual(summary);
  });

  it("getUsage returns null when nothing is shared", async () => {
    actor.getUsageSummary.mockResolvedValue({ ok: [] });
    expect(await quoteService.getUsage("REQ_1")).toBeNull();
  });

  it("getUsage throws NotAuthorized for callers the request isn't shown to", async () => {
    actor.getUsageSummary.mockResolvedValue({ err: { NotAuthorized: null } });
    await expect(quoteService.getUsage("REQ_1")).rejects.toThrow("NotAuthorized");
  });

  it("removeUsage calls the canister", async () => {
    actor.removeUsageSummary.mockResolvedValue({ ok: null });
    await quoteService.removeUsage("REQ_1");
    expect(actor.removeUsageSummary).toHaveBeenCalledWith("REQ_1");
  });
});
