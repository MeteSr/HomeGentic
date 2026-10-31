/**
 * GET /photos-config tells clients whether to upload off-chain.
 *
 * PCFG.1 off until the bucket, the photo canister ID and the signing identity are all set
 * PCFG.2 on when they are, and needs no session or API key
 */

jest.mock("../paymentCanister", () => ({
  activateInCanister:        jest.fn(),
  activateSubscriptionUntil: jest.fn(),
  consumeAgentCredit:        jest.fn(),
  grantAgentCreditsOnce:     jest.fn(),
  recordGift:                jest.fn(),
  AlreadyConsumedError:      class AlreadyConsumedError extends Error {},
  PAID_TIERS:                new Set(["Pro", "ContractorPro"]),
  PRINCIPAL_RE:              /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/,
  fetchSubscriptionTier:     jest.fn(),
  getAgent:                  jest.fn(),
}));
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels:       jest.fn().mockResolvedValue([]),
  recordFrontendError:    jest.fn(),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../src/propertyCanister", () => ({ markIdentityCleared: jest.fn() }));

import { describe, it, expect } from "@jest/globals";
import worker from "../src/index";

function makeEnv(over: Record<string, unknown> = {}): any {
  const kv = new Map<string, string>();
  return {
    VOICE_AGENT_API_KEY: "pubkey", FRONTEND_ORIGIN: "https://app.test", NODE_ENV: "production",
    CANISTER_ID_AUTH: "auth-id",
    RATE_LIMIT: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); } },
    ...over,
  };
}

const ctx: any = { waitUntil: () => {} };
const READY = { PHOTOS: {}, CANISTER_ID_PHOTO: "photo-id", DFX_IDENTITY_PEM: "pem" };

async function config(env: any): Promise<{ status: number; body: any }> {
  const res = await worker.fetch(new Request("https://worker.test/photos-config"), env, ctx);
  return { status: res.status, body: await res.json() };
}

describe("GET /photos-config", () => {
  it("PCFG.1 is off until storage, photo canister and identity are all configured", async () => {
    expect((await config(makeEnv())).body).toEqual({ offChain: false });
    for (const missing of Object.keys(READY)) {
      const env = makeEnv({ ...READY, [missing]: undefined });
      expect((await config(env)).body).toEqual({ offChain: false });
    }
  });

  it("PCFG.2 is on when everything is set, without a session or API key", async () => {
    const { status, body } = await config(makeEnv(READY));
    expect(status).toBe(200);
    expect(body).toEqual({ offChain: true });
  });
});
