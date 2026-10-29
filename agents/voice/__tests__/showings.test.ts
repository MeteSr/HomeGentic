/**
 * FSBO showing requests through the Worker (src/showings.ts), M-2 of the
 * 2026-10-28 security audit.
 *
 *   SHOW.1 per-IP limits run before the canister is called
 *   SHOW.2 signed-in buyers file as themselves; visitors as a per-IP principal
 *   SHOW.3 input validation and canister errors
 */
import { describe, it, expect, jest } from "@jest/globals";
import { Principal } from "@icp-sdk/core/principal";
import {
  handleShowingRequest, visitorPrincipal,
  SHOWINGS_PER_IP_LISTING_DAY, SHOWINGS_PER_IP_HOUR,
} from "../src/showings";

function kv() {
  const m = new Map<string, string>();
  return {
    RATE_LIMIT: {
      get: async (k: string) => m.get(k) ?? null,
      put: async (k: string, v: string) => { m.set(k, v); },
      delete: async (k: string) => { m.delete(k); },
    } as any,
  };
}

const BUYER = "2vxsx-fae";
const okShowing = (requester: Principal) => ({
  ok: {
    id: "s1", propertyId: "P1", requester, name: "Ana", contact: "ana@example.com", preferredTime: "Sat 10am",
    createdAt: 1_700_000_000_000_000_000n, status: { Pending: null }, alternateTime: [],
  },
});
const input = (propertyId = "P1") => ({ propertyId, name: "Ana", contact: "ana@example.com", preferredTime: "Sat 10am" });

function deps(principal: string | null = null) {
  const file = jest.fn(async (_i: any, requester: Principal) => okShowing(requester));
  return { deps: { principal: async () => principal, file }, file };
}

describe("SHOW.1 per-IP limits", () => {
  it("stops one IP after the per-listing daily cap, without calling the canister", async () => {
    const env = kv();
    const d = deps();
    for (let i = 0; i < SHOWINGS_PER_IP_LISTING_DAY; i++) {
      expect((await handleShowingRequest(input(), "1.2.3.4", env, d.deps)).status).toBe(201);
    }
    expect((await handleShowingRequest(input(), "1.2.3.4", env, d.deps)).status).toBe(429);
    expect(d.file).toHaveBeenCalledTimes(SHOWINGS_PER_IP_LISTING_DAY);
    // Another connection is unaffected.
    expect((await handleShowingRequest(input(), "5.6.7.8", env, d.deps)).status).toBe(201);
  });

  it("caps one IP across listings per hour", async () => {
    const env = kv();
    const d = deps();
    for (let i = 0; i < SHOWINGS_PER_IP_HOUR; i++) {
      expect((await handleShowingRequest(input(`P${i}`), "9.9.9.9", env, d.deps)).status).toBe(201);
    }
    expect((await handleShowingRequest(input("PX"), "9.9.9.9", env, d.deps)).status).toBe(429);
  });
});

describe("SHOW.2 requester", () => {
  it("files as the signed-in buyer", async () => {
    const d = deps(BUYER);
    await handleShowingRequest(input(), "1.1.1.1", kv(), d.deps);
    expect(d.file.mock.calls[0][1].toText()).toBe(BUYER);
  });

  it("files a signed-out visitor as a stable principal derived from the IP", async () => {
    const d = deps(null);
    const r = await handleShowingRequest(input(), "1.1.1.1", kv(), d.deps);
    const used = d.file.mock.calls[0][1] as Principal;
    expect(used.toText()).toBe((await visitorPrincipal("1.1.1.1")).toText());
    expect(used.isAnonymous()).toBe(false);
    expect((await visitorPrincipal("1.1.1.2")).toText()).not.toBe(used.toText());
    expect(r.body).toEqual(expect.objectContaining({ id: "s1", status: "Pending", createdAt: 1_700_000_000_000 }));
  });
});

describe("SHOW.3 validation and errors", () => {
  it("rejects bad input before counting or calling", async () => {
    const d = deps();
    expect((await handleShowingRequest({ ...input(), propertyId: "../x" }, "1.1.1.1", kv(), d.deps)).status).toBe(400);
    expect((await handleShowingRequest({ ...input(), contact: "x" }, "1.1.1.1", kv(), d.deps)).status).toBe(400);
    expect(d.file).not.toHaveBeenCalled();
  });

  it("maps canister errors", async () => {
    const file = jest.fn(async () => ({ err: { NotFound: null } }));
    expect((await handleShowingRequest(input(), "1.1.1.1", kv(), { principal: async () => null, file })).status).toBe(404);
    const file2 = jest.fn(async () => ({ err: { InvalidInput: "You already have requests open for this home" } }));
    const r = await handleShowingRequest(input(), "1.1.1.1", kv(), { principal: async () => null, file: file2 });
    expect(r).toEqual({ status: 400, body: { error: "You already have requests open for this home" } });
  });
});
