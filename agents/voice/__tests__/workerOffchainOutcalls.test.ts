/**
 * src/offchainOutcalls.ts + the Worker routes that replace the ai_proxy
 * canister's keyed outcalls and the payment canister's Stripe outcalls (M-6).
 *
 * OFF.1  the new routes need a session (401 without one)
 * OFF.2  ATTOM: key in header, per-user daily quota, global budget, cache
 * OFF.3  permits: unsupported city short-circuits; ArcGIS LIKE escaping;
 *        OpenPermit needs its key; per-user quota
 * OFF.4  contractor invite: content and link come from the job canister's
 *        invite preview, not the body; signed/expired invites refused;
 *        per-token cap
 * OFF.5  broker lead: recipient is LOCAL_BROKER_EMAIL, fields escaped
 * OFF.6  gift checkouts are registered in the payment canister (relay)
 *        from verify-session and from checkout.session.completed
 */

const mockSessionsRetrieve    = jest.fn();
const mockConstructEventAsync = jest.fn();
jest.mock("stripe", () => {
  const Stripe: any = jest.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: mockSessionsRetrieve, create: jest.fn() } },
    subscriptions: { retrieve: jest.fn() },
    webhooks: { constructEventAsync: mockConstructEventAsync },
  }));
  Stripe.createSubtleCryptoProvider = jest.fn(() => ({}));
  return { __esModule: true, default: Stripe };
});
jest.mock("../paymentCanister", () => ({
  activateInCanister:        jest.fn().mockResolvedValue(undefined),
  activateSubscriptionUntil: jest.fn().mockResolvedValue(undefined),
  consumeAgentCredit:        jest.fn().mockRejectedValue(new Error("none")),
  grantAgentCreditsOnce:     jest.fn().mockResolvedValue(undefined),
  recordGift:                jest.fn().mockResolvedValue(undefined),
  AlreadyConsumedError:      class AlreadyConsumedError extends Error {},
  PAID_TIERS:                new Set(["Pro", "ContractorPro"]),
  fetchSubscriptionTier:     jest.fn().mockResolvedValue("Free"),
}));
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels:       jest.fn().mockResolvedValue([]),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../anthropicProvider", () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({ complete: jest.fn(), stream: jest.fn(), completeWithTools: jest.fn() })),
}));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) => (token === "hgs_good" ? "user-aaa" : null)),
}));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn().mockResolvedValue("Free") }));
jest.mock("../src/jobCanister", () => ({ getInvitePreview: jest.fn() }));

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import worker from "../src/index";
import {
  lookupPropertyDetails, importPermits, orlandoAddressPrefix, sendContractorInvite, sendBrokerLead,
  ATTOM_PER_USER_DAY, INVITE_EMAILS_PER_TOKEN,
} from "../src/offchainOutcalls";
import { recordGift } from "../paymentCanister";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
  } as unknown as KVNamespace;
}

function env(over: Record<string, unknown> = {}): any {
  return {
    ANTHROPIC_API_KEY: "sk-ant", VOICE_AGENT_API_KEY: "pubkey", FRONTEND_ORIGIN: "https://app.test",
    NODE_ENV: "production", CANISTER_ID_AUTH: "auth-id", STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x", ATTOM_API_KEY: "attom-key", OPENPERMIT_API_KEY: "op-key",
    RESEND_API_KEY: "re_key", LOCAL_BROKER_EMAIL: "broker@homegentic.app",
    RATE_LIMIT: fakeKV(), ...over,
  };
}

const okJson = (data: unknown) =>
  jest.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch & jest.Mock;

const ADDR = { address: "1 Main St", city: "Austin", state: "TX", zip: "78701" };
const TOKEN = "INV_" + "ab".repeat(32);

beforeEach(() => jest.clearAllMocks());

describe("OFF.1 — session required", () => {
  it.each(["/api/property/details", "/api/permits/import", "/api/email/contractor-invite", "/api/email/broker-lead"])(
    "%s → 401 without x-agent-session", async (path) => {
      const res = await worker.fetch(new Request(`https://w.test${path}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": "pubkey" }, body: "{}",
      }), env(), { waitUntil: () => {} } as any);
      expect(res.status).toBe(401);
    });
});

describe("OFF.2 — ATTOM property details", () => {
  it("sends the key in a header, caches, and enforces the per-user quota", async () => {
    const e = env();
    const f = okJson({ property: [{}] });
    const r = await lookupPropertyDetails(ADDR, "u1", e, f);
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("address1=1+Main+St");
    expect(url).not.toContain("attom-key");
    expect((init.headers as Record<string, string>).apikey).toBe("attom-key");
    // Same address again: served from cache, no new upstream call.
    await lookupPropertyDetails(ADDR, "u1", e, f);
    expect(f).toHaveBeenCalledTimes(1);
    for (let i = 1; i < ATTOM_PER_USER_DAY; i++) {
      expect((await lookupPropertyDetails({ ...ADDR, address: `${i} Elm` }, "u1", e, f)).status).toBe(200);
    }
    expect((await lookupPropertyDetails({ ...ADDR, address: "99 Oak" }, "u1", e, f)).status).toBe(429);
    expect((await lookupPropertyDetails({ ...ADDR, address: "99 Oak" }, "u2", e, f)).status).toBe(200);
  });

  it("keeps part of the global budget for paid accounts (CD-11)", async () => {
    const e = env({ ATTOM_DAILY_BUDGET: "10" });   // free accounts share 7
    const f = okJson({});
    for (let i = 0; i < 7; i++) {
      expect((await lookupPropertyDetails({ ...ADDR, address: `${i} Free St` }, `free-${i}`, e, f)).status).toBe(200);
    }
    expect((await lookupPropertyDetails({ ...ADDR, address: "8 Free St" }, "free-8", e, f)).status).toBe(429);
    for (let i = 0; i < 3; i++) {
      expect((await lookupPropertyDetails({ ...ADDR, address: `${i} Pro St` }, `pro-${i}`, e, f, "Pro")).status).toBe(200);
    }
    expect((await lookupPropertyDetails({ ...ADDR, address: "4 Pro St" }, "pro-4", e, f, "Pro")).status).toBe(429);
  });

  it("enforces the global daily budget and needs the key", async () => {
    const e = env({ ATTOM_DAILY_BUDGET: "1" });
    const f = okJson({});
    expect((await lookupPropertyDetails(ADDR, "u1", e, f)).status).toBe(200);
    expect((await lookupPropertyDetails({ ...ADDR, address: "2 Main" }, "u2", e, f)).status).toBe(429);
    expect((await lookupPropertyDetails(ADDR, "u1", env({ ATTOM_API_KEY: "" }), f)).status).toBe(503);
    expect((await lookupPropertyDetails({ address: "x".repeat(201) }, "u1", env(), f)).status).toBe(400);
  });
});

describe("OFF.3 — permit import", () => {
  it("unsupported city returns without an upstream call", async () => {
    const f = okJson({});
    const r = await importPermits({ ...ADDR, city: "Smallville" }, "u1", env(), f);
    expect(r.body).toEqual({ source: "unsupported", data: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it("Volusia uses ArcGIS with LIKE wildcards stripped and quotes doubled", async () => {
    const f = okJson({ features: [] });
    const r = await importPermits({ address: "1 O'Brien%_ St, Deland", city: "DeLand", state: "FL", zip: "32720" }, "u1", env(), f);
    expect(r.status).toBe(200);
    expect((r.body as any).source).toBe("arcgis");
    const url = new URL((f.mock.calls[0] as [string])[0]);
    expect(url.hostname).toBe("maps5.vcgov.org");
    expect(url.searchParams.get("where")).toBe("FOLDERDESCRIPTION LIKE '%1 O''Brien St%'");
  });

  it("Orlando queries the city's Socrata dataset by house number and street, no key needed", async () => {
    const f = okJson([]);
    const r = await importPermits({ address: "1234 East Robinson Street, Apt 2", city: "Orlando", state: "FL", zip: "32801" }, "u1", env({ OPENPERMIT_API_KEY: "" }), f);
    expect(r.status).toBe(200);
    expect((r.body as any).source).toBe("orlando");
    const url = new URL((f.mock.calls[0] as [string])[0]);
    expect(url.hostname).toBe("data.cityoforlando.net");
    expect(url.pathname).toBe("/resource/ryhf-m453.json");
    const where = url.searchParams.get("$where")!;
    expect(where).toContain("upper(permit_address) like '1234 E ROBINSON%'");
    expect(where).toContain("application_type in('Building Permit','Electrical','Plumbing','Mechanical Permit','GAS','Demolition Permit')");
    expect(where).toContain("issue_permit_date IS NOT NULL");
  });

  it("Orlando needs a house number", async () => {
    const f = okJson([]);
    expect((await importPermits({ address: "Robinson St", city: "Orlando", state: "FL", zip: "32801" }, "u1", env(), f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("orlandoAddressPrefix keeps number, direction and name, drops suffix, unit and punctuation", () => {
    expect(orlandoAddressPrefix("4060 Eastgate Dr.")).toBe("4060 EASTGATE");
    expect(orlandoAddressPrefix("1 E. Yale St #3")).toBe("1 E YALE");
    expect(orlandoAddressPrefix("5900 Universal Blvd, Orlando, FL")).toBe("5900 UNIVERSAL");
    expect(orlandoAddressPrefix("12 Lake Way")).toBe("12 LAKE");
    expect(orlandoAddressPrefix("12 Broadway")).toBe("12 BROADWAY");
    expect(orlandoAddressPrefix("O'Brien% St")).toBeNull();
  });

  it("OpenPermit sends the bearer key and needs it", async () => {
    const f = okJson({ results: [] });
    const r = await importPermits(ADDR, "u1", env(), f);
    expect((r.body as any).source).toBe("openpermit");
    expect(((f.mock.calls[0] as any)[1].headers as any).Authorization).toBe("Bearer op-key");
    expect((await importPermits(ADDR, "u1", env({ OPENPERMIT_API_KEY: "" }), f)).status).toBe(503);
  });
});

describe("OFF.4 — contractor invite email", () => {
  const preview = {
    jobId: "J1", title: "t", serviceType: "HVAC", amount: 150000n, propertyAddress: "9 Real Rd <b>",
    contractorName: "Pat", expiresAt: BigInt(Date.now() + 3_600_000) * 1_000_000n, alreadySigned: false,
  };

  it("caps invite emails across all users per day (CD-9)", async () => {
    const e = env({ INVITE_EMAIL_DAILY_BUDGET: "2" });   // free accounts share 1
    const f = okJson({ id: "e1" });
    const tok = (n: number) => `INV_${String(n).padStart(16, "0")}`;
    expect((await sendContractorInvite({ token: tok(1), to: "a@b.co" }, "u1", e, async () => preview, f)).status).toBe(200);
    expect((await sendContractorInvite({ token: tok(2), to: "a@b.co" }, "u2", e, async () => preview, f)).status).toBe(429);
    expect((await sendContractorInvite({ token: tok(3), to: "a@b.co" }, "u3", e, async () => preview, f, "Pro")).status).toBe(200);
    expect((await sendContractorInvite({ token: tok(4), to: "a@b.co" }, "u4", e, async () => preview, f, "Pro")).status).toBe(429);
  });

  it("builds the email from the invite preview and the configured origin", async () => {
    const f = okJson({ id: "e1" });
    const r = await sendContractorInvite({ token: TOKEN, to: "pro@example.com", propertyAddress: "evil", verifyUrl: "https://evil" },
      "u1", env(), async () => preview, f);
    expect(r).toEqual({ status: 200, body: { sent: true } });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as any).Authorization).toBe("Bearer re_key");
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toBe("pro@example.com");
    expect(sent.html).toContain(`https://app.test/verify/${TOKEN}`);
    expect(sent.html).toContain("9 Real Rd &lt;b&gt;");
    expect(sent.html).not.toContain("evil");
  });

  it("refuses unknown, signed or expired invites and bad input", async () => {
    const f = okJson({});
    expect((await sendContractorInvite({ token: TOKEN, to: "a@b.co" }, "u1", env(), async () => null, f)).status).toBe(404);
    expect((await sendContractorInvite({ token: TOKEN, to: "a@b.co" }, "u1", env(), async () => ({ ...preview, alreadySigned: true }), f)).status).toBe(409);
    expect((await sendContractorInvite({ token: TOKEN, to: "a@b.co" }, "u1", env(), async () => ({ ...preview, expiresAt: 1n }), f)).status).toBe(410);
    expect((await sendContractorInvite({ token: "nope", to: "a@b.co" }, "u1", env(), async () => preview, f)).status).toBe(400);
    expect((await sendContractorInvite({ token: TOKEN, to: "not-an-email" }, "u1", env(), async () => preview, f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it(`caps sends per token at ${INVITE_EMAILS_PER_TOKEN}`, async () => {
    const e = env();
    const f = okJson({});
    for (let i = 0; i < INVITE_EMAILS_PER_TOKEN; i++) {
      expect((await sendContractorInvite({ token: TOKEN, to: `x${i}@b.co` }, `u${i}`, e, async () => preview, f)).status).toBe(200);
    }
    expect((await sendContractorInvite({ token: TOKEN, to: "y@b.co" }, "u9", e, async () => preview, f)).status).toBe(429);
  });
});

describe("OFF.5 — broker lead", () => {
  it("goes to LOCAL_BROKER_EMAIL with escaped fields", async () => {
    const f = okJson({});
    const r = await sendBrokerLead({ name: "<script>", email: "me@x.co", propertyAddress: "1 Main" }, "u1", env(), f);
    expect(r.status).toBe(200);
    const sent = JSON.parse(((f.mock.calls[0] as any)[1] as RequestInit).body as string);
    expect(sent.to).toBe("broker@homegentic.app");
    expect(sent.reply_to).toBe("me@x.co");
    expect(sent.html).toContain("&lt;script&gt;");
    expect((await sendBrokerLead({ name: "a", email: "me@x.co" }, "u1", env({ LOCAL_BROKER_EMAIL: "" }), f)).status).toBe(503);
  });
});

describe("OFF.6 — gift checkouts are registered via the payment relay", () => {
  const giftSession = {
    id: "cs_test_gift1", payment_status: "paid", status: "complete",
    metadata: { principal: "user-aaa", is_gift: "true", tier: "Pro", billing: "Yearly",
                recipient_email: "r@x.co", recipient_name: "R", sender_name: "S", gift_message: "hi", delivery_date: "" },
  };

  it("verify-session registers the gift and returns its token", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(giftSession as never);
    const res = await worker.fetch(new Request("https://w.test/api/stripe/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "pubkey", "x-agent-session": "hgs_good" },
      body: JSON.stringify({ sessionId: "cs_test_gift1" }),
    }), env(), { waitUntil: () => {} } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "gift", giftToken: "cs_test_gift1" });
    expect(recordGift).toHaveBeenCalledWith("cs_test_gift1", "Pro", "Yearly", expect.objectContaining({ recipientEmail: "r@x.co" }));
  });

  it("checkout.session.completed registers a paid gift", async () => {
    mockConstructEventAsync.mockResolvedValueOnce({ id: "evt_g1", type: "checkout.session.completed", data: { object: giftSession } } as never);
    const res = await worker.fetch(new Request("https://w.test/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": "sig" }, body: "{}",
    }), env(), { waitUntil: () => {} } as any);
    expect(res.status).toBe(200);
    expect(recordGift).toHaveBeenCalledWith("cs_test_gift1", "Pro", "Yearly", expect.any(Object));
  });
});
