/**
 * feeService referral-fee paths against the canister (test-gap audit
 * 2026-11-03, M2): card lookup, newest-first ordering, the admin list and
 * waive, and the Stripe card-setup call through the voice Worker.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const mockActor = {
  getMyReferralCard: vi.fn(),
  getMyReferralFees: vi.fn(),
  getAllReferralFees: vi.fn(),
  waiveReferralFee: vi.fn(),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) }, HttpAgent: vi.fn() }));
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: mockFetch }));

let hasErrorCode: typeof import("@/services/candid").hasErrorCode;
let errorMessage: typeof import("@/services/candid").errorMessage;

const NS = 1_000_000n;
function rawFee(id: string, createdMs: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    quoteId: "q-" + id,
    requestId: "r-" + id,
    contractor: { toText: () => "contractor-p" },
    homeowner: { toText: () => "owner-p" },
    propertyId: "p1",
    serviceType: "HVAC",
    bidCents: 100_000n,
    feeCents: 3_000n,
    status: { Pending: null },
    reason: "verified_job",
    acceptedAt: [BigInt(createdMs) * NS],
    jobId: [],
    dueAt: [],
    paymentRef: "",
    payUrl: "",
    failedAt: [],
    createdAt: BigInt(createdMs) * NS,
    ...extra,
  };
}

let feeService: typeof import("@/services/fee").feeService;

beforeAll(async () => {
  vi.stubEnv("FEE_CANISTER_ID", "aaaaa-aaaaa-aaaaa-aaaaa-cai");
  vi.resetModules();
  feeService = (await import("@/services/fee")).feeService;
  ({ hasErrorCode, errorMessage } = await import("@/services/candid"));
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  feeService.reset();
});

describe("getMyReferralCard", () => {
  it("returns the saved card with agreedAt in ms", async () => {
    mockActor.getMyReferralCard.mockResolvedValue([
      { brand: "visa", last4: "4242", agreedAt: 5n * NS, termsVersion: "v2" },
    ]);
    expect(await feeService.getMyReferralCard()).toEqual({
      brand: "visa",
      last4: "4242",
      agreedAt: 5,
      termsVersion: "v2",
    });
  });

  it("returns null when no card is saved", async () => {
    mockActor.getMyReferralCard.mockResolvedValue([]);
    expect(await feeService.getMyReferralCard()).toBeNull();
  });
});

describe("getMyReferralFees", () => {
  it("converts each fee and sorts newest first", async () => {
    mockActor.getMyReferralFees.mockResolvedValue([
      rawFee("old", 1_000),
      rawFee("new", 9_000, { jobId: ["j1"], dueAt: [2_000n * NS] }),
    ]);
    const fees = await feeService.getMyReferralFees();
    expect(fees.map((f) => f.id)).toEqual(["new", "old"]);
    expect(fees[0]).toMatchObject({
      jobId: "j1",
      dueAt: 2_000,
      feeCents: 3_000,
      bidCents: 100_000,
      contractor: "contractor-p",
      status: "Pending",
    });
    expect(fees[1]).toMatchObject({ jobId: null, dueAt: null, failedAt: null, acceptedAt: 1_000 });
  });
});

describe("getAllReferralFees (admin)", () => {
  it("returns the converted list", async () => {
    mockActor.getAllReferralFees.mockResolvedValue({ ok: [rawFee("a", 1)] });
    expect((await feeService.getAllReferralFees())[0].id).toBe("a");
  });

  it("throws a typed error a non-admin can branch on", async () => {
    mockActor.getAllReferralFees.mockResolvedValue({ err: { NotAuthorized: null } });
    const err = await feeService.getAllReferralFees().catch((e) => e);
    expect(hasErrorCode(err, "NotAuthorized")).toBe(true);
  });
});

describe("waiveReferralFee (admin)", () => {
  it("passes the note through and returns the waived fee", async () => {
    mockActor.waiveReferralFee.mockResolvedValue({
      ok: rawFee("a", 1, { status: { Waived: null }, reason: "goodwill" }),
    });
    const f = await feeService.waiveReferralFee("a", "goodwill");
    expect(mockActor.waiveReferralFee).toHaveBeenCalledWith("a", "goodwill");
    expect(f).toMatchObject({ status: "Waived", reason: "goodwill" });
  });

  it("throws a typed CanisterError, not a bare tag, for an unknown fee", async () => {
    mockActor.waiveReferralFee.mockResolvedValue({ err: { NotFound: null } });
    const err = await feeService.waiveReferralFee("nope", "x").catch((e) => e);
    expect(hasErrorCode(err, "NotFound")).toBe(true);
    expect(errorMessage(err, "fallback")).not.toBe("NotFound");
  });

  it("keeps the canister's text for InvalidInput", async () => {
    mockActor.waiveReferralFee.mockResolvedValue({ err: { InvalidInput: "That fee is already paid." } });
    const err = await feeService.waiveReferralFee("a", "x").catch((e) => e);
    expect(hasErrorCode(err, "InvalidInput")).toBe(true);
    expect(errorMessage(err, "fallback")).toBe("That fee is already paid.");
  });
});

describe("startReferralCardSetup", () => {
  it("posts the return URL to the Worker and returns the Checkout URL", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/x" }) });
    expect(await feeService.startReferralCardSetup("https://app/back")).toBe("https://checkout.stripe.com/x");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/api\/stripe\/referral-card$/);
    expect(JSON.parse(init.body)).toEqual({ returnUrl: "https://app/back" });
  });

  it("shows the Worker's error when it refuses", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Card setup is off." }) });
    await expect(feeService.startReferralCardSetup("x")).rejects.toThrow("Card setup is off.");
  });

  it("falls back to friendly copy when the body isn't JSON or has no url", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });
    await expect(feeService.startReferralCardSetup("x")).rejects.toThrow("Couldn't open the card form just now.");
  });
});
