/**
 * quoteService against the canister (test-gap audit 2026-11-03, M2). The
 * older quote.test.ts patches the service in memory; this file drives the
 * real code paths with a mocked actor: argument encoding, record decoding,
 * error mapping, and the sealed-bid encrypt/reveal hand-off.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const a = {
  createQuoteRequest: vi.fn(),
  getMyQuoteRequests: vi.fn(),
  getOpenRequests: vi.fn(),
  getOpenRequestsForMe: vi.fn(),
  submitQuote: vi.fn(),
  getQuoteRequest: vi.fn(),
  getMyQuotes: vi.fn(),
  getQuotesForRequest: vi.fn(),
  acceptQuote: vi.fn(),
  closeQuoteRequest: vi.fn(),
  cancelQuoteRequest: vi.fn(),
  attachUsageSummary: vi.fn(),
  removeUsageSummary: vi.fn(),
  getUsageSummary: vi.fn(),
  getIbePublicKey: vi.fn(),
  submitSealedBid: vi.fn(),
  revealBidsEncrypted: vi.fn(),
  setQuoteRequestSubtype: vi.fn(),
  getQuoteRequestSubtypes: vi.fn(),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => a) }, HttpAgent: vi.fn() }));
const sb = vi.hoisted(() => ({
  sealedBidIdentity: vi.fn((id: string) => new TextEncoder().encode(id)),
  ibeEncryptAmount: vi.fn(async () => new Uint8Array([9, 9])),
  ibeDecryptBids: vi.fn(async () => [{ id: "b1", amountCents: 50_000, isWinner: true }]),
}));
vi.mock("@/services/sealedBid", async (orig) => ({ ...(await orig<any>()), ...sb }));
vi.mock("@icp-sdk/vetkeys", () => ({
  TransportSecretKey: { random: () => ({ publicKeyBytes: () => new Uint8Array([1, 2, 3]) }) },
}));

const NS = 1_000_000n;
const principal = (t: string) => ({ toText: () => t });
function rawRequest(extra: Record<string, unknown> = {}) {
  return {
    id: "r1",
    propertyId: "p1",
    homeowner: principal("owner"),
    serviceType: { HVAC: null },
    urgency: { High: null },
    description: "AC out",
    status: { Open: null },
    zipCode: [],
    createdAt: 2_000n * NS,
    closeAt: [],
    minTrustScore: [],
    minJobsCompleted: [],
    minReviews: [],
    maxBids: [],
    ...extra,
  };
}
function rawQuote(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    requestId: "r1",
    contractor: principal("c-" + id),
    amount: 120_000n,
    timeline: 3n,
    validUntil: 9_000n * NS,
    status: { Pending: null },
    createdAt: 1_000n * NS,
    ...extra,
  };
}

let quoteService: typeof import("@/services/quote").quoteService;
let hasErrorCode: typeof import("@/services/candid").hasErrorCode;

beforeAll(async () => {
  vi.stubEnv("QUOTE_CANISTER_ID", "aaaaa-aaaaa-aaaaa-aaaaa-cai");
  vi.resetModules();
  quoteService = (await import("@/services/quote")).quoteService;
  ({ hasErrorCode } = await import("@/services/candid"));
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  quoteService.reset();
});

describe("createRequest", () => {
  it("encodes urgency as a capitalised variant and optional filters as opt values", async () => {
    a.createQuoteRequest.mockResolvedValue({
      ok: rawRequest({ zipCode: ["32801"], maxBids: [5n], closeAt: [5_000n * NS] }),
    });
    const r = await quoteService.createRequest({
      propertyId: "p1",
      serviceType: "HVAC",
      urgency: "high",
      description: "AC out",
      zipCode: "32801",
      minTrustScore: 70,
      maxBids: 5,
    });
    expect(a.createQuoteRequest).toHaveBeenCalledWith(
      "p1",
      { HVAC: null },
      "AC out",
      { High: null },
      ["32801"],
      [70n],
      [],
      [],
      [5n],
    );
    expect(r).toMatchObject({
      id: "r1",
      homeowner: "owner",
      urgency: "high",
      status: "open",
      zipCode: "32801",
      maxBids: 5,
      closeAt: 5_000,
      createdAt: 2_000,
    });
    expect(r.minTrustScore).toBeUndefined();
  });

  it("sends empty opts when no filters are set, and throws the canister's tier-limit error", async () => {
    a.createQuoteRequest.mockResolvedValue({ err: { InvalidInput: "Free plans can have 3 open requests." } });
    const err = await quoteService
      .createRequest({ propertyId: "p1", serviceType: "Plumbing", urgency: "low", description: "drip" })
      .catch((e) => e);
    expect(a.createQuoteRequest.mock.calls[0].slice(4)).toEqual([[], [], [], [], []]);
    expect(hasErrorCode(err, "InvalidInput")).toBe(true);
    expect(err.message).toBe("Free plans can have 3 open requests.");
  });

  it("rejects a status the client doesn't know instead of guessing", async () => {
    a.getMyQuoteRequests.mockResolvedValue([rawRequest({ status: { Archived: null } })]);
    await expect(quoteService.getRequests()).rejects.toThrow(/Unknown canister variant for requestStatus/);
  });
});

describe("listing requests", () => {
  it("getRequests, getOpenRequests and getOpenRequestsForMe decode every record", async () => {
    a.getMyQuoteRequests.mockResolvedValue([rawRequest()]);
    a.getOpenRequests.mockResolvedValue([rawRequest({ id: "r2", minReviews: [4n], minJobsCompleted: [2n] })]);
    a.getOpenRequestsForMe.mockResolvedValue([rawRequest({ id: "r3", urgency: { Emergency: null } })]);
    expect((await quoteService.getRequests())[0].id).toBe("r1");
    expect((await quoteService.getOpenRequests())[0]).toMatchObject({ id: "r2", minReviews: 4, minJobsCompleted: 2 });
    expect((await quoteService.getOpenRequestsForMe())[0].urgency).toBe("emergency");
  });
});

describe("getRequest", () => {
  it("returns the decoded request", async () => {
    a.getQuoteRequest.mockResolvedValue({ ok: rawRequest() });
    expect((await quoteService.getRequest("r1"))?.description).toBe("AC out");
  });

  it("returns undefined for NotFound", async () => {
    a.getQuoteRequest.mockResolvedValue({ err: { NotFound: null } });
    expect(await quoteService.getRequest("nope")).toBeUndefined();
  });

  it("throws when the canister is paused or unreachable, rather than reporting the request missing", async () => {
    a.getQuoteRequest.mockResolvedValue({ err: { Paused: null } });
    const err = await quoteService.getRequest("r1").catch((e) => e);
    expect(hasErrorCode(err, "Paused")).toBe(true);
  });
});

describe("bids", () => {
  it("submitQuote converts validUntil ms to ns and decodes the quote", async () => {
    a.submitQuote.mockResolvedValue({ ok: rawQuote("q1") });
    const q = await quoteService.submitQuote("r1", 120_000, 3, 9_000);
    expect(a.submitQuote).toHaveBeenCalledWith("r1", 120_000n, 3n, 9_000n * NS);
    expect(q).toEqual({
      id: "q1",
      requestId: "r1",
      contractor: "c-q1",
      amount: 120_000,
      timeline: 3,
      validUntil: 9_000,
      status: "pending",
      createdAt: 1_000,
    });
  });

  it("submitQuote throws the canister error", async () => {
    a.submitQuote.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(hasErrorCode(await quoteService.submitQuote("r1", 1, 1, 1).catch((e) => e), "NotAuthorized")).toBe(true);
  });

  it("getMyBids decodes the caller's quotes", async () => {
    a.getMyQuotes.mockResolvedValue([rawQuote("q1", { status: { Accepted: null } })]);
    expect((await quoteService.getMyBids())[0].status).toBe("accepted");
  });

  it("getQuotesForRequest returns [] when the caller can't see the request", async () => {
    a.getQuotesForRequest.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(await quoteService.getQuotesForRequest("r1")).toEqual([]);
    a.getQuotesForRequest.mockResolvedValue({ err: { NotFound: null } });
    expect(await quoteService.getQuotesForRequest("r1")).toEqual([]);
  });

  it('getQuotesForRequest throws on an outage instead of showing "no bids"', async () => {
    a.getQuotesForRequest.mockResolvedValue({ err: { Unavailable: "Quotes are unavailable right now." } });
    const err = await quoteService.getQuotesForRequest("r1").catch((e) => e);
    expect(hasErrorCode(err, "Unavailable")).toBe(true);
  });

  it("getBidCountMap counts each request's bids and skips the ones that fail", async () => {
    a.getQuotesForRequest.mockImplementation(async (id: string) =>
      id === "down" ? Promise.reject(new Error("reject")) : { ok: id === "r1" ? [rawQuote("a"), rawQuote("b")] : [] },
    );
    expect(await quoteService.getBidCountMap(["r1", "r2", "down"])).toEqual({ r1: 2, r2: 0 });
  });

  it("accept, close and cancel pass the id and throw typed errors", async () => {
    a.acceptQuote.mockResolvedValue({ ok: null });
    a.closeQuoteRequest.mockResolvedValue({ ok: null });
    a.cancelQuoteRequest.mockResolvedValue({ err: { AlreadyCancelled: null } });
    await quoteService.accept("q1");
    await quoteService.close("r1");
    const err = await quoteService.cancel("r1").catch((e) => e);
    expect(a.acceptQuote).toHaveBeenCalledWith("q1");
    expect(a.closeQuoteRequest).toHaveBeenCalledWith("r1");
    expect(hasErrorCode(err, "AlreadyCancelled")).toBe(true);
    a.acceptQuote.mockResolvedValue({ err: { NotFound: null } });
    expect(hasErrorCode(await quoteService.accept("q2").catch((e) => e), "NotFound")).toBe(true);
    a.closeQuoteRequest.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(hasErrorCode(await quoteService.close("r2").catch((e) => e), "NotAuthorized")).toBe(true);
  });
});

describe("usage summaries", () => {
  const summary = {
    asOf: "2026-10",
    series: [
      {
        category: "Electric" as any,
        unit: "kWh",
        months: [
          { month: "2026-09", amountCents: 12_345.4, usage: 800 },
          { month: "2026-10", amountCents: 100, usage: null },
        ],
      },
    ],
  };

  it("attachUsage encodes cents as whole nat and null usage as an empty opt", async () => {
    a.attachUsageSummary.mockResolvedValue({ ok: null });
    await quoteService.attachUsage("r1", summary);
    expect(a.attachUsageSummary).toHaveBeenCalledWith("r1", {
      asOf: "2026-10",
      series: [
        {
          category: { Electric: null },
          unit: ["kWh"],
          months: [
            { month: "2026-09", amountCents: 12_345n, usage: [800] },
            { month: "2026-10", amountCents: 100n, usage: [] },
          ],
        },
      ],
    });
  });

  it("getUsage round-trips the summary and returns null when none is shared", async () => {
    a.getUsageSummary.mockResolvedValue({
      ok: [
        {
          asOf: "2026-10",
          series: [
            { category: { Electric: null }, unit: [], months: [{ month: "2026-09", amountCents: 500n, usage: [] }] },
          ],
        },
      ],
    });
    expect(await quoteService.getUsage("r1")).toEqual({
      asOf: "2026-10",
      series: [{ category: "Electric", unit: null, months: [{ month: "2026-09", amountCents: 500, usage: null }] }],
    });
    a.getUsageSummary.mockResolvedValue({ ok: [] });
    expect(await quoteService.getUsage("r1")).toBeNull();
  });

  it("getUsage and removeUsage throw typed errors", async () => {
    a.getUsageSummary.mockResolvedValue({ err: { NotAuthorized: null } });
    a.removeUsageSummary.mockResolvedValue({ err: { NotFound: null } });
    expect(hasErrorCode(await quoteService.getUsage("r1").catch((e) => e), "NotAuthorized")).toBe(true);
    expect(hasErrorCode(await quoteService.removeUsage("r1").catch((e) => e), "NotFound")).toBe(true);
  });
});

describe("sealed bids", () => {
  it("encrypts the amount to the request's identity and submits only ciphertext", async () => {
    a.getIbePublicKey.mockResolvedValue([7, 7, 7]);
    a.submitSealedBid.mockResolvedValue({
      ok: { id: "b1", requestId: "r1", timelineDays: 4n, submittedAt: 3_000n * NS },
    });
    const out = await quoteService.submitSealedBidEncrypted("r1", 50_000, 4);
    expect(sb.ibeEncryptAmount).toHaveBeenCalledWith(new Uint8Array([7, 7, 7]), new TextEncoder().encode("r1"), 50_000);
    expect(a.submitSealedBid).toHaveBeenCalledWith("r1", [9, 9], 4n);
    expect(out).toEqual({ id: "b1", requestId: "r1", timelineDays: 4, submittedAt: 3_000 });
  });

  it("throws the canister's error when the bid window is closed", async () => {
    a.getIbePublicKey.mockResolvedValue([7]);
    a.submitSealedBid.mockResolvedValue({ err: { DeadlinePassed: null } });
    expect(
      hasErrorCode(await quoteService.submitSealedBidEncrypted("r1", 1, 1).catch((e) => e), "DeadlinePassed"),
    ).toBe(true);
  });

  it("reveal sends a transport key and decrypts locally with the request identity", async () => {
    a.getIbePublicKey.mockResolvedValue([7]);
    a.revealBidsEncrypted.mockResolvedValue({
      ok: {
        encryptedKey: [4, 4],
        bids: [
          {
            id: "b1",
            requestId: "r1",
            contractor: principal("c1"),
            ciphertext: [9, 9],
            timelineDays: 2n,
            submittedAt: 1n,
          },
        ],
      },
    });
    const bids = await quoteService.revealBidsDecrypted("r1");
    expect(a.revealBidsEncrypted).toHaveBeenCalledWith("r1", [1, 2, 3]);
    const [key, pub, ident, , raw] = sb.ibeDecryptBids.mock.calls[0] as any[];
    expect([...key]).toEqual([4, 4]);
    expect([...pub]).toEqual([7]);
    expect(new TextDecoder().decode(ident)).toBe("r1");
    expect(raw[0]).toMatchObject({ contractor: "c1", ciphertext: [9, 9], timelineDays: 2 });
    expect(bids[0].isWinner).toBe(true);
  });

  it("reveal throws when the caller doesn't own the request", async () => {
    a.revealBidsEncrypted.mockResolvedValue({ err: { NotAuthorized: null } });
    expect(hasErrorCode(await quoteService.revealBidsDecrypted("r1").catch((e) => e), "NotAuthorized")).toBe(true);
  });
});

describe("helpers", () => {
  it("quota per tier matches the canister (0 = unlimited)", () => {
    expect([
      quoteService.getQuotaForTier("Free"),
      quoteService.getQuotaForTier("Pro"),
      quoteService.getQuotaForTier("ContractorPro"),
      quoteService.getQuotaForTier("???"),
    ]).toEqual([3, 0, 0, 3]);
  });
});

// #721: a subtype of Other (Septic, Inspection, …) is kept beside the request
// in the quote canister (setQuoteRequestSubtype), not in its ServiceType.
describe("subtypes of Other (#721)", () => {
  it("creates a septic request as Other, then records the subtype", async () => {
    a.createQuoteRequest.mockResolvedValue({ ok: rawRequest({ serviceType: { Other: null } }) });
    a.setQuoteRequestSubtype.mockResolvedValue({ ok: null });
    const r = await quoteService.createRequest({
      propertyId: "p1", serviceType: "Septic", urgency: "low", description: "Pump the tank",
    });
    expect(a.createQuoteRequest.mock.calls[0][1]).toEqual({ Other: null });
    expect(a.setQuoteRequestSubtype).toHaveBeenCalledWith("r1", ["Septic"]);
    expect(r.serviceType).toBe("Septic");
  });

  it("doesn't call setQuoteRequestSubtype for a named type or plain Other", async () => {
    a.createQuoteRequest.mockResolvedValue({ ok: rawRequest() });
    await quoteService.createRequest({ propertyId: "p1", serviceType: "HVAC", urgency: "low", description: "x" });
    a.createQuoteRequest.mockResolvedValue({ ok: rawRequest({ serviceType: { Other: null } }) });
    const other = await quoteService.createRequest({ propertyId: "p1", serviceType: "Other", urgency: "low", description: "x" });
    expect(a.setQuoteRequestSubtype).not.toHaveBeenCalled();
    expect(other.serviceType).toBe("Other");
  });

  it("shows Other, as the canister has it, when the subtype couldn't be saved", async () => {
    a.createQuoteRequest.mockResolvedValue({ ok: rawRequest({ serviceType: { Other: null } }) });
    a.setQuoteRequestSubtype.mockRejectedValue(new Error("no such method"));
    const r = await quoteService.createRequest({
      propertyId: "p1", serviceType: "Chimney", urgency: "low", description: "Sweep",
    });
    expect(r.serviceType).toBe("Other");
  });

  it("labels listed Other requests by their subtype, asking only about Other requests", async () => {
    a.getMyQuoteRequests.mockResolvedValue([
      rawRequest({ id: "r1", serviceType: { Other: null } }),
      rawRequest({ id: "r2", serviceType: { HVAC: null } }),
      rawRequest({ id: "r3", serviceType: { Other: null } }),
    ]);
    a.getQuoteRequestSubtypes.mockResolvedValue([["r1", "Inspection"]]);
    const rs = await quoteService.getRequests();
    expect(a.getQuoteRequestSubtypes).toHaveBeenCalledWith(["r1", "r3"]);
    expect(rs.map((r) => r.serviceType)).toEqual(["Inspection", "HVAC", "Other"]);
  });

  it("skips the subtype lookup when nothing is Other, and lists as Other if it fails", async () => {
    a.getOpenRequests.mockResolvedValue([rawRequest()]);
    await quoteService.getOpenRequests();
    expect(a.getQuoteRequestSubtypes).not.toHaveBeenCalled();

    a.getOpenRequestsForMe.mockResolvedValue([rawRequest({ serviceType: { Other: null } })]);
    a.getQuoteRequestSubtypes.mockRejectedValue(new Error("canister predates the method"));
    const [r] = await quoteService.getOpenRequestsForMe();
    expect(r.serviceType).toBe("Other");
  });

  it("labels a single request by its subtype", async () => {
    a.getQuoteRequest.mockResolvedValue({ ok: rawRequest({ serviceType: { Other: null } }) });
    a.getQuoteRequestSubtypes.mockResolvedValue([["r1", "TreeService"]]);
    expect((await quoteService.getRequest("r1"))!.serviceType).toBe("Tree Service");
  });
});
