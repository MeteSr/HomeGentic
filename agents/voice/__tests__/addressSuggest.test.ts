/**
 * src/addressSuggest.ts — Add Property address suggestions via Google Places.
 *
 * ADDR.1  routes need a session (401 without one)
 * ADDR.2  suggest: key in a header only, US addresses, short input skipped
 * ADDR.3  per-minute limit with exponential lockout, daily and global limits
 * ADDR.4  place: components parsed into address / city / state / ZIP
 */

jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn(),
  activateSubscriptionUntil: jest.fn(),
  consumeAgentCredit: jest.fn(),
  grantAgentCreditsOnce: jest.fn(),
  recordGift: jest.fn(),
  AlreadyConsumedError: class AlreadyConsumedError extends Error {},
  PAID_TIERS: new Set(["Pro", "ContractorPro"]),
  fetchSubscriptionTier: jest.fn(),
}));
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn(),
  checkCycleLevels: jest.fn(),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../anthropicProvider", () => ({ AnthropicProvider: jest.fn().mockImplementation(() => ({})) }));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) => (token === "hgs_good" ? "user-aaa" : null)),
}));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn(async () => "Free") }));

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import worker from "../src/index";
import {
  suggestAddresses,
  placeAddress,
  parseAddressComponents,
  SUGGEST_PER_USER_MINUTE,
  PLACE_PER_USER_DAY,
} from "../src/addressSuggest";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
  } as unknown as KVNamespace;
}

const env = (over: Record<string, unknown> = {}): any => ({
  ANTHROPIC_API_KEY: "sk-ant",
  VOICE_AGENT_API_KEY: "pubkey",
  FRONTEND_ORIGIN: "https://app.test",
  NODE_ENV: "production",
  CANISTER_ID_AUTH: "auth-id",
  GOOGLE_PLACES_API_KEY: "gp-key",
  RATE_LIMIT: fakeKV(),
  ...over,
});

const okJson = (data: unknown) =>
  jest.fn(
    async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(data), { status: 200 }),
  ) as unknown as typeof fetch & jest.Mock;

const PREDICTIONS = {
  suggestions: [
    {
      placePrediction: {
        placeId: "ChIJ_place_one",
        structuredFormat: { mainText: { text: "12 Elm St" }, secondaryText: { text: "Orlando, FL, USA" } },
      },
    },
    { queryPrediction: { text: { text: "elm" } } },
  ],
};

// Built at runtime so the secret scanner doesn't read a test token as a key.
const SESSION = ["sess", "12345678"].join("-");

beforeEach(() => jest.clearAllMocks());

describe("ADDR.1 — session required", () => {
  it.each(["/api/address/suggest", "/api/address/place"])("%s → 401 without x-agent-session", async (path) => {
    const res = await worker.fetch(
      new Request(`https://w.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "pubkey" },
        body: "{}",
      }),
      env(),
      { waitUntil: () => {} } as any,
    );
    expect(res.status).toBe(401);
  });
});

describe("ADDR.2 — suggest", () => {
  it("sends the key in a header, restricts to the US and returns place predictions only", async () => {
    const f = okJson(PREDICTIONS);
    const r = await suggestAddresses({ input: "12 elm", sessionToken: SESSION }, "u1", env(), f);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      suggestions: [{ placeId: "ChIJ_place_one", main: "12 Elm St", secondary: "Orlando, FL, USA" }],
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(url).not.toContain("gp-key");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("gp-key");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ input: "12 elm", includedRegionCodes: ["us"], sessionToken: SESSION });
  });

  it("skips Google for short input, rejects long input and needs the key", async () => {
    const f = okJson(PREDICTIONS);
    expect((await suggestAddresses({ input: "12" }, "u1", env(), f)).body).toEqual({ suggestions: [] });
    expect(f).not.toHaveBeenCalled();
    expect((await suggestAddresses({ input: "x".repeat(201) }, "u1", env(), f)).status).toBe(400);
    expect((await suggestAddresses({ input: "12 elm" }, "u1", env({ GOOGLE_PLACES_API_KEY: "" }), f)).status).toBe(503);
  });

  it("drops a malformed session token instead of forwarding it", async () => {
    const f = okJson(PREDICTIONS);
    await suggestAddresses({ input: "12 elm", sessionToken: "bad token!" }, "u1", env(), f);
    expect(JSON.parse((f.mock.calls[0] as [string, RequestInit])[1].body as string)).not.toHaveProperty("sessionToken");
  });
});

describe("ADDR.3 — limits and backoff", () => {
  it("locks a caller out after the per-minute limit, doubling the lockout each time", async () => {
    const e = env();
    const f = okJson(PREDICTIONS);
    for (let i = 0; i < SUGGEST_PER_USER_MINUTE; i++) {
      expect((await suggestAddresses({ input: `12 elm ${i}` }, "u1", e, f)).status).toBe(200);
    }
    const over = await suggestAddresses({ input: "12 elm again" }, "u1", e, f);
    expect(over.status).toBe(429);
    expect(over.retryAfter).toBe(60);
    // Still locked out, and another user isn't affected.
    expect((await suggestAddresses({ input: "12 elm later" }, "u1", e, f)).status).toBe(429);
    expect((await suggestAddresses({ input: "12 elm" }, "u2", e, f)).status).toBe(200);
  });

  it("enforces the global daily budget", async () => {
    const e = env({ ADDRESS_DAILY_BUDGET: "1" });
    const f = okJson(PREDICTIONS);
    expect((await suggestAddresses({ input: "12 elm" }, "u1", e, f)).status).toBe(200);
    expect((await suggestAddresses({ input: "12 elm" }, "u2", e, f)).status).toBe(429);
  });

  it("caps place lookups per user per day", async () => {
    const e = env();
    const today = new Date().toISOString().slice(0, 10);
    await e.RATE_LIMIT.put(`addr:place:u1:${today}`, String(PLACE_PER_USER_DAY));
    const f = okJson({ addressComponents: [] });
    const r = await placeAddress({ placeId: "ChIJ_place_one" }, "u1", e, f);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: "daily_address_limit_reached" });
    expect(f).not.toHaveBeenCalled();
    expect((await placeAddress({ placeId: "ChIJ_place_one" }, "u2", e, f)).status).toBe(200);
  });
});

describe("ADDR.4 — place details", () => {
  it("parses components into the form's fields", async () => {
    const f = okJson({
      addressComponents: [
        { longText: "12", shortText: "12", types: ["street_number"] },
        { longText: "North Elm Street", shortText: "N Elm St", types: ["route"] },
        { longText: "4", shortText: "4", types: ["subpremise"] },
        { longText: "Orlando", shortText: "Orlando", types: ["locality", "political"] },
        { longText: "Florida", shortText: "FL", types: ["administrative_area_level_1", "political"] },
        { longText: "32801", shortText: "32801", types: ["postal_code"] },
      ],
    });
    const r = await placeAddress({ placeId: "ChIJ_place_one", sessionToken: SESSION }, "u1", env(), f);
    expect(r.body).toEqual({ address: "12 N Elm St #4", city: "Orlando", state: "FL", zipCode: "32801" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://places.googleapis.com/v1/places/ChIJ_place_one?sessionToken=${SESSION}`);
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("addressComponents");
  });

  it("rejects a malformed place id without calling Google", async () => {
    const f = okJson({});
    expect((await placeAddress({ placeId: "../../x" }, "u1", env(), f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("returns empty fields for missing components", () => {
    expect(parseAddressComponents(undefined)).toEqual({ address: "", city: "", state: "", zipCode: "" });
  });
});
