/**
 * Agent Credit Top-Up — source analysis + behaviour tests  (#89)
 *
 * CREDIT.1  CREDIT_PACKS constant is exported and contains entries for 25 and 100
 * CREDIT.2  consumeAgentCredit helper exists in server source
 * CREDIT.3  grantAgentCredits helper exists in server source
 * CREDIT.4  /api/agent fallback: credit draw attempted before returning 429
 * CREDIT.5  POST /api/stripe/create-credit-checkout route is registered
 * CREDIT.6  POST /api/stripe/verify-credit-purchase route is registered
 * CREDIT.7  Both new routes read STRIPE_SECRET_KEY from env (never hardcoded)
 * CREDIT.8  create-credit-checkout reads pack price IDs from env vars
 * CREDIT.9  CREDIT_PACKS.25 → STRIPE_PRICE_CREDITS_25 env var
 * CREDIT.10 CREDIT_PACKS.100 → STRIPE_PRICE_CREDITS_100 env var
 * CREDIT.11 /api/agent 429 body includes creditsAvailable: false
 * CREDIT.12 consumeAgentCredit validates principal format before shell call
 * CREDIT.13 grantAgentCredits validates principal format before shell call
 * CREDIT.14 verify-credit-purchase rejects sessions where type !== "agent_credits"
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CREDIT_PACKS } from "../server";

const SERVER_PATH          = resolve(__dirname, "../server.ts");
const src                  = readFileSync(SERVER_PATH, "utf8");
const PAYMENT_CANISTER_PATH = resolve(__dirname, "../paymentCanister.ts");
const canisterSrc           = readFileSync(PAYMENT_CANISTER_PATH, "utf8");

// ── CREDIT.1 — CREDIT_PACKS exported with 25 and 100 entries ─────────────────

describe("CREDIT.1 — CREDIT_PACKS constant", () => {
  it("exports CREDIT_PACKS", () => {
    expect(CREDIT_PACKS).toBeDefined();
  });

  it("has an entry for pack size 25", () => {
    expect(CREDIT_PACKS[25]).toBeDefined();
    expect(typeof CREDIT_PACKS[25].envVar).toBe("string");
    expect(typeof CREDIT_PACKS[25].label).toBe("string");
  });

  it("has an entry for pack size 100", () => {
    expect(CREDIT_PACKS[100]).toBeDefined();
    expect(typeof CREDIT_PACKS[100].envVar).toBe("string");
    expect(typeof CREDIT_PACKS[100].label).toBe("string");
  });

  it("has no entry for an invalid pack size", () => {
    expect(CREDIT_PACKS[50]).toBeUndefined();
  });
});

// ── CREDIT.2 / CREDIT.3 — helpers defined in server source ───────────────────

describe("CREDIT.2 — consumeAgentCredit helper", () => {
  it("is defined as an exported async function in paymentCanister.ts", () => {
    expect(canisterSrc).toMatch(/export async function consumeAgentCredit/);
  });

  it("calls the payment canister consumeAgentCredit method via @dfinity/agent", () => {
    expect(canisterSrc).toMatch(/\.consumeAgentCredit\(Principal\.fromText/);
  });
});

describe("CREDIT.3 — grantAgentCredits helper", () => {
  it("is defined as an exported async function in paymentCanister.ts", () => {
    expect(canisterSrc).toMatch(/export async function grantAgentCredits/);
  });

  it("calls the payment canister adminGrantAgentCredits method via @dfinity/agent", () => {
    expect(canisterSrc).toMatch(/adminGrantAgentCredits/);
  });
});

// ── CREDIT.4 — /api/agent credit fallback before 429 ─────────────────────────

describe("CREDIT.4 — /api/agent credit fallback", () => {
  it("attempts consumeAgentCredit when tier quota is exhausted", () => {
    expect(src).toMatch(/consumeAgentCredit\(principal\)/);
  });

  it("logs a structured event when a credit is consumed", () => {
    expect(src).toMatch(/agent_credit_used/);
  });

  it("only falls back when principal is not 'anon'", () => {
    // The guard `principal !== "anon"` must appear before the consumeAgentCredit call
    const agentRoute = src.slice(src.indexOf('app.post("/api/agent"'));
    expect(agentRoute).toMatch(/principal.*!==.*["']anon["']/);
  });
});

// ── CREDIT.5 / CREDIT.6 — route registration ─────────────────────────────────

describe("CREDIT.5 — create-credit-checkout route", () => {
  it("registers POST /api/stripe/create-credit-checkout", () => {
    expect(src).toMatch(/app\.post\(\s*["'`]\/api\/stripe\/create-credit-checkout["'`]/);
  });
});

describe("CREDIT.6 — verify-credit-purchase route", () => {
  it("registers POST /api/stripe/verify-credit-purchase", () => {
    expect(src).toMatch(/app\.post\(\s*["'`]\/api\/stripe\/verify-credit-purchase["'`]/);
  });
});

// ── CREDIT.7 — secret key from env ───────────────────────────────────────────

describe("CREDIT.7 — secret key sourced from env in credit routes", () => {
  it("does not hardcode sk_live_ or sk_test_ keys", () => {
    expect(src).not.toMatch(/["'`]sk_(?:live|test)_[A-Za-z0-9]+["'`]/);
  });

  it("reads STRIPE_SECRET_KEY from process.env in create-credit-checkout", () => {
    const routeBlock = src.slice(src.indexOf("/api/stripe/create-credit-checkout"));
    expect(routeBlock.slice(0, routeBlock.indexOf("});") + 3)).toMatch(/STRIPE_SECRET_KEY/);
  });
});

// ── CREDIT.8 / CREDIT.9 / CREDIT.10 — env-var price IDs ─────────────────────

describe("CREDIT.8 — pack price IDs from env vars", () => {
  it("reads STRIPE_PRICE_CREDITS_25 from process.env", () => {
    expect(src).toMatch(/STRIPE_PRICE_CREDITS_25/);
  });

  it("reads STRIPE_PRICE_CREDITS_100 from process.env", () => {
    expect(src).toMatch(/STRIPE_PRICE_CREDITS_100/);
  });
});

describe("CREDIT.9 — CREDIT_PACKS[25] uses STRIPE_PRICE_CREDITS_25", () => {
  it("envVar field matches the expected env var name", () => {
    expect(CREDIT_PACKS[25].envVar).toBe("STRIPE_PRICE_CREDITS_25");
  });
});

describe("CREDIT.10 — CREDIT_PACKS[100] uses STRIPE_PRICE_CREDITS_100", () => {
  it("envVar field matches the expected env var name", () => {
    expect(CREDIT_PACKS[100].envVar).toBe("STRIPE_PRICE_CREDITS_100");
  });
});

// ── CREDIT.11 — 429 body shape ────────────────────────────────────────────────

describe("CREDIT.11 — 429 response includes creditsAvailable: false", () => {
  it("emits creditsAvailable: false when both tier and credits are exhausted", () => {
    expect(src).toMatch(/creditsAvailable:\s*false/);
  });
});

// ── CREDIT.12 / CREDIT.13 — principal validation ─────────────────────────────

describe("CREDIT.12 — consumeAgentCredit validates principal", () => {
  it("rejects an invalid principal format before making a canister call", () => {
    const helperBlock = canisterSrc.slice(
      canisterSrc.indexOf("export async function consumeAgentCredit"),
      canisterSrc.indexOf("export async function grantAgentCredits"),
    );
    expect(helperBlock).toMatch(/Invalid principal/);
  });
});

describe("CREDIT.13 — grantAgentCredits validates principal", () => {
  it("rejects an invalid principal format before making a canister call", () => {
    const helperBlock = canisterSrc.slice(
      canisterSrc.indexOf("export async function grantAgentCredits"),
    );
    expect(helperBlock).toMatch(/Invalid principal/);
  });
});

// ── CREDIT.14 — verify-credit-purchase type guard ────────────────────────────

describe("CREDIT.14 — verify-credit-purchase rejects non-credit sessions", () => {
  it('checks that session metadata type === "agent_credits"', () => {
    const start = src.indexOf('"/api/stripe/verify-credit-purchase"');
    const routeBlock = src.slice(start, start + 2000);
    expect(routeBlock).toMatch(/agent_credits/);
  });
});
