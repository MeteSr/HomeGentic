/**
 * Bid to List routes in the Worker (src/bidtolist.ts) — X-2 follow-up.
 *
 * Bid to List users have their own II principals, so the email routes can't
 * require a HomeGentic session. Instead each email must be justified by
 * canister state, go only to recipients taken from canister data, and be sent
 * at most once per (event, entity).
 *
 * BTLW.1 new-proposal: needs an existing proposal on an open request; once per proposal
 * BTLW.2 proposal-result: only when Awarded; winner/losers from canister state; once each
 * BTLW.3 listing-cancelled: only when Cancelled; sent to proposers, not body addresses
 * BTLW.4 agent-verified: only for verified profiles; once
 * BTLW.5 reveal-opened / new-listing gates
 * BTLW.6 checkout is bound to an Owed fee for the Accepted proposal; metadata from the record
 * BTLW.7 per-IP rate limit; HTML escaping
 */

const mockResendSend          = jest.fn();
const mockSessionsCreate      = jest.fn();

jest.mock("stripe", () => {
  const Stripe: any = jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionsCreate } },
    webhooks: { constructEventAsync: jest.fn() },
  }));
  Stripe.createSubtleCryptoProvider = jest.fn(() => ({}));
  return { __esModule: true, default: Stripe };
});

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}), { virtual: true });

// Canister state the fake actors serve.
const state: {
  request: any | null;
  proposals: any[];
  profiles: Record<string, any>;
  fees: any[];
  cityAgents: any[];
  nearDeadline: any[];
} = { request: null, proposals: [], profiles: {}, fees: [], cityAgents: [], nearDeadline: [] };

jest.mock("@icp-sdk/core/agent", () => {
  const actual = jest.requireActual("@icp-sdk/core/agent") as Record<string, unknown>;
  const listing = {
    getBidRequest: jest.fn(async (id: string) => (state.request && state.request.id === id ? { ok: state.request } : { err: { NotFound: null } })),
    getProposalsForRequest: jest.fn(async (id: string) => state.proposals.filter((p) => p.requestId === id)),
    getListingsNearDeadline: jest.fn(async () => state.nearDeadline),
    tickCascade: jest.fn(async () => undefined),
  };
  const agent = {
    getProfile: jest.fn(async (p: any) => {
      const prof = state.profiles[p.toText()];
      return prof ? [prof] : [];
    }),
    getAgentsForCity: jest.fn(async () => state.cityAgents),
  };
  const fee = {
    getAllFees: jest.fn(async () => ({ ok: state.fees })),
    markFeePaid: jest.fn(),
  };
  const byId: Record<string, unknown> = { "listing-id": listing, "agent-id": agent, "fee-id": fee };
  class FakeHttpAgent {
    static async create() { return new FakeHttpAgent(); }
    async fetchRootKey() {}
  }
  return {
    ...actual,
    HttpAgent: FakeHttpAgent,
    Actor: { createActor: (_f: unknown, o: { canisterId: string }) => byId[o.canisterId] },
  };
});

import { describe, it, expect, beforeEach } from "@jest/globals";
import { Principal } from "@icp-sdk/core/principal";
import { handleBidtolist, scheduledBidtolist } from "../src/bidtolist";
import { RateLimiterDO, type CounterNamespace, type CounterStorage } from "../src/rateLimiterDO";

const A1 = Principal.fromUint8Array(new Uint8Array([1, 1, 1])).toText();
const A2 = Principal.fromUint8Array(new Uint8Array([2, 2, 2])).toText();
const A3 = Principal.fromUint8Array(new Uint8Array([3, 3, 3])).toText();
const HOMEOWNER = Principal.fromUint8Array(new Uint8Array([9, 9, 9]));

function fakeNamespace(): CounterNamespace {
  const objects = new Map<string, RateLimiterDO>();
  const storage = (): CounterStorage => {
    const m = new Map<string, unknown>();
    return {
      get: async (k) => m.get(k) as any, put: async (k, v) => { m.set(k, v); },
      deleteAll: async () => { m.clear(); }, setAlarm: async () => {},
    };
  };
  return {
    idFromName: (n) => n,
    get: (id: string) => {
      if (!objects.has(id)) objects.set(id, new RateLimiterDO({ storage: storage() }));
      const o = objects.get(id)!;
      return { fetch: (_u: string, init?: RequestInit) => o.fetch(new Request("https://do/", init)) };
    },
  };
}

let env: any;
function call(path: string, body: unknown, ip = "1.1.1.1") {
  return handleBidtolist(new Request(`https://w.test/api/bidtolist${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  }), path, env);
}

const proposal = (id: string, agent: string, status: string) => ({
  id, requestId: "REQ_1", agentId: Principal.fromText(agent), agentName: "body name",
  agentEmail: "attacker@evil.test", status: { [status]: null },
});
const profile = (email: string, name: string, isVerified = true) => ({ email, name, isVerified });

beforeEach(() => {
  jest.clearAllMocks();
  mockResendSend.mockResolvedValue({ id: "e" });
  env = {
    BIDTOLIST_LISTING_CANISTER_ID: "listing-id",
    BIDTOLIST_AGENT_CANISTER_ID: "agent-id",
    BIDTOLIST_FEE_CANISTER_ID: "fee-id",
    BIDTOLIST_IDENTITY_SEED: "11".repeat(32),
    BIDTOLIST_STRIPE_SECRET_KEY: "sk_test", BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE: "price_fee",
    BIDTOLIST_FRONTEND_ORIGIN: "https://bidtolist.test",
    RATE_LIMITER: fakeNamespace(),
  };
  state.request = {
    id: "REQ_1", city: "Austin <b>", homeowner: HOMEOWNER, homeownerEmail: "owner@home.test",
    bidDeadline: BigInt(Date.now() + 86_400_000) * 1_000_000n, status: { Open: null },
  };
  state.proposals = [];
  state.profiles = {
    [A1]: profile("a1@agents.test", "<script>x</script>"),
    [A2]: profile("a2@agents.test", "Agent Two"),
    [A3]: profile("a3@agents.test", "Agent Three"),
  };
  state.fees = [];
  state.cityAgents = [];
  state.nearDeadline = [];
});

const recipients = () => mockResendSend.mock.calls.map((c: any[]) => c[0].to);

describe("BTLW.1 — new-proposal", () => {
  it("404 when the proposal doesn't exist; nothing sent", async () => {
    const res = await call("/email/new-proposal", { requestId: "REQ_1", proposalId: "PROP_9" });
    expect(res.status).toBe(404);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("emails the homeowner from the record once per proposal", async () => {
    state.proposals = [proposal("PROP_1", A1, "Pending")];
    const r1 = await call("/email/new-proposal", { requestId: "REQ_1", proposalId: "PROP_1", agentEmail: "x@evil.test" });
    expect(r1.status).toBe(200);
    const r2 = await call("/email/new-proposal", { requestId: "REQ_1", proposalId: "PROP_1" });
    expect(await r2.json()).toEqual({ ok: true, deduped: true });
    expect(recipients()).toEqual(["owner@home.test"]);
    expect(mockResendSend.mock.calls[0][0].html).toContain("Austin &lt;b&gt;");
  });

  it("requires proposalId", async () => {
    const res = await call("/email/new-proposal", { requestId: "REQ_1" });
    expect(res.status).toBe(400);
  });
});

describe("BTLW.2 — proposal-result", () => {
  it("409 while the request is still Open", async () => {
    state.proposals = [proposal("PROP_1", A1, "Pending")];
    const res = await call("/email/proposal-result", { requestId: "REQ_1" });
    expect(res.status).toBe(409);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("after Awarded: winner and losers from canister state, profile emails, once each", async () => {
    state.request.status = { Awarded: null };
    state.proposals = [proposal("PROP_1", A1, "Accepted"), proposal("PROP_2", A2, "Rejected"), proposal("PROP_3", A3, "Withdrawn")];
    const res = await call("/email/proposal-result", { requestId: "REQ_1", agentEmail: "victim@corp.test", won: true });
    expect(await res.json()).toEqual({ ok: true, sent: 2 });
    expect(recipients().sort()).toEqual(["a1@agents.test", "a2@agents.test"]);
    const win = mockResendSend.mock.calls.find((c: any[]) => c[0].to === "a1@agents.test")![0];
    expect(win.subject).toMatch(/Congratulations/);
    expect(win.html).toContain("&lt;script&gt;");
    expect(win.html).not.toContain("<script>");
    const lose = mockResendSend.mock.calls.find((c: any[]) => c[0].to === "a2@agents.test")![0];
    expect(lose.html).toMatch(/selected another agent/);

    mockResendSend.mockClear();
    const again = await call("/email/proposal-result", { requestId: "REQ_1" });
    expect(await again.json()).toEqual({ ok: true, sent: 0 });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("a failed send is released so a retry can deliver it", async () => {
    state.request.status = { Awarded: null };
    state.proposals = [proposal("PROP_1", A1, "Accepted")];
    mockResendSend.mockRejectedValueOnce(new Error("down"));
    expect(await (await call("/email/proposal-result", { requestId: "REQ_1" })).json()).toEqual({ ok: true, sent: 0 });
    expect(await (await call("/email/proposal-result", { requestId: "REQ_1" })).json()).toEqual({ ok: true, sent: 1 });
  });
});

describe("BTLW.3 — listing-cancelled", () => {
  it("409 unless Cancelled", async () => {
    state.proposals = [proposal("PROP_1", A1, "Pending")];
    expect((await call("/email/listing-cancelled", { requestId: "REQ_1" })).status).toBe(409);
  });

  it("emails proposers (never body addresses) once", async () => {
    state.request.status = { Cancelled: null };
    state.proposals = [proposal("PROP_1", A1, "Pending"), proposal("PROP_2", A2, "Pending")];
    await call("/email/listing-cancelled", { requestId: "REQ_1", agentEmail: "victim@corp.test" });
    await call("/email/listing-cancelled", { requestId: "REQ_1" });
    expect(recipients().sort()).toEqual(["a1@agents.test", "a2@agents.test"]);
  });
});

describe("BTLW.4 — agent-verified", () => {
  it("409 for an unverified profile", async () => {
    state.profiles[A1].isVerified = false;
    expect((await call("/email/agent-verified", { agentPrincipal: A1 })).status).toBe(409);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("sends once to the profile email", async () => {
    await call("/email/agent-verified", { agentPrincipal: A2, agentEmail: "victim@corp.test" });
    const again = await call("/email/agent-verified", { agentPrincipal: A2 });
    expect(await again.json()).toEqual({ ok: true, deduped: true });
    expect(recipients()).toEqual(["a2@agents.test"]);
  });
});

describe("BTLW.5 — reveal-opened / new-listing", () => {
  it("reveal-opened waits for the deadline and needs a live proposal", async () => {
    state.proposals = [proposal("PROP_1", A1, "Pending")];
    expect((await call("/email/reveal-opened", { requestId: "REQ_1" })).status).toBe(409);
    state.request.bidDeadline = BigInt(Date.now() - 1000) * 1_000_000n;
    expect((await call("/email/reveal-opened", { requestId: "REQ_1" })).status).toBe(200);
    expect(await (await call("/email/reveal-opened", { requestId: "REQ_1" })).json()).toEqual({ ok: true, deduped: true });
    expect(recipients()).toEqual(["owner@home.test"]);
  });

  it("new-listing goes to verified city agents once per listing", async () => {
    state.cityAgents = [
      { id: Principal.fromText(A1), name: "A1", email: "a1@agents.test", isVerified: true },
      { id: Principal.fromText(A2), name: "A2", email: "a2@agents.test", isVerified: false },
    ];
    expect(await (await call("/email/new-listing", { requestId: "REQ_1" })).json()).toEqual({ ok: true, sent: 1 });
    expect(await (await call("/email/new-listing", { requestId: "REQ_1" })).json()).toEqual({ ok: true, sent: 0 });
    expect(recipients()).toEqual(["a1@agents.test"]);
  });

  it("404 for an unknown request", async () => {
    expect((await call("/email/new-listing", { requestId: "REQ_404" })).status).toBe(404);
  });
});

describe("BTLW.6 — fee checkout", () => {
  const fee = (status: string, proposalId = "PROP_1") => ({
    id: "FEE_1", requestId: "REQ_1", proposalId, agentId: Principal.fromText(A1),
    homeownerId: HOMEOWNER, amountCents: 39_900n, status: { [status]: null },
  });

  it("creates a session for an Owed fee on the Accepted proposal, metadata from the record", async () => {
    state.request.status = { Awarded: null };
    state.proposals = [proposal("PROP_1", A1, "Accepted")];
    state.fees = [fee("Owed")];
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/x" });
    const res = await call("/stripe/create-checkout-session",
      { proposalId: "PROP_1", successUrl: "https://evil.test" });
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/x" });
    const args = mockSessionsCreate.mock.calls[0][0] as any;
    expect(args.metadata).toEqual({ feeId: "FEE_1", proposalId: "PROP_1", requestId: "REQ_1", agentId: A1 });
    expect(args.success_url).toBe("https://bidtolist.test/agents/dashboard?fee_paid=1");
  });

  it("refuses paid fees, unknown fees and superseded proposals", async () => {
    state.proposals = [proposal("PROP_1", A1, "Rejected")];
    state.fees = [fee("Paid")];
    expect((await call("/stripe/create-checkout-session", { proposalId: "PROP_1" })).status).toBe(409);
    state.fees = [fee("Owed")];
    expect((await call("/stripe/create-checkout-session", { proposalId: "PROP_1" })).status).toBe(409);
    expect((await call("/stripe/create-checkout-session", { proposalId: "PROP_2" })).status).toBe(404);
    expect((await call("/stripe/create-checkout-session", { proposalId: "PROP_1", feeId: "FEE_X" })).status).toBe(404);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });
});

describe("BTLW.7 — per-IP rate limit", () => {
  it("429 after 30 requests in an hour from one IP", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await call("/email/agent-verified", { agentPrincipal: "bad" }, "9.9.9.9")).status).toBe(400);
    }
    expect((await call("/email/agent-verified", { agentPrincipal: A1 }, "9.9.9.9")).status).toBe(429);
    expect((await call("/email/agent-verified", { agentPrincipal: A1 }, "8.8.8.8")).status).toBe(200);
  });
});

describe("BTLW.8 — deadline reminders (cron)", () => {
  beforeEach(() => {
    state.nearDeadline = [{ id: "REQ_1", city: "Austin", bidDeadline: state.request.bidDeadline, proposalCount: 1n }];
    state.cityAgents = [
      { id: Principal.fromText(A1), name: "A1", email: "a1@agents.test", isVerified: true },
      { id: Principal.fromText(A2), name: "A2", email: "a2@agents.test", isVerified: true },
    ];
  });

  it("skips agents who already submitted a proposal", async () => {
    state.proposals = [proposal("P1", A1, "Pending")];
    await scheduledBidtolist(env);
    expect(recipients()).toEqual(["a2@agents.test"]);
  });

  it("sends nothing for a listing whose proposals can't be read", async () => {
    const { Actor } = jest.requireMock("@icp-sdk/core/agent") as any;
    const listing = Actor.createActor(null, { canisterId: "listing-id" });
    listing.getProposalsForRequest.mockRejectedValueOnce(new Error("canister unreachable"));
    await scheduledBidtolist(env);
    expect(recipients()).toEqual([]);
  });
});
