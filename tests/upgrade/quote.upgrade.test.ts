/**
 * Quote canister — upgrade persistence tests
 *
 * Verifies that quote requests (including zipCode), sealed bids, and tier
 * grants survive a canister upgrade.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, quoteIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("quote");

interface QuoteActor {
  addAdmin:               (p: object, nonce: string) => Promise<{ ok: null } | { err: object }>;
  setBootstrapNonce:      (nonce: string) => Promise<void>;
  setTier:                (user: object, tier: object) => Promise<{ ok: null } | { err: object }>;
  createQuoteRequest:     (propertyId: string, serviceType: object, description: string, urgency: object, zipCode: [] | [string]) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  createSealedBidRequest: (propertyId: string, serviceType: object, description: string, urgency: object, closeAtNs: bigint, zipCode: [] | [string]) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  submitSealedBid:        (requestId: string, ciphertext: Uint8Array | number[], timelineDays: bigint) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getQuoteRequest:        (requestId: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getMyBid:               (requestId: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getMetrics:             () => Promise<Record<string, bigint | boolean>>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

// Little-endian Nat8 encoding of amountCents for the mock IBE ciphertext
function encodeCents(cents: number): number[] {
  const buf = new Uint8Array(4);
  buf[0] = cents & 0xff;
  buf[1] = (cents >> 8) & 0xff;
  buf[2] = (cents >> 16) & 0xff;
  buf[3] = (cents >> 24) & 0xff;
  return Array.from(buf);
}

describe("quote canister — upgrade persistence", () => {
  let pic:        PocketIc;
  let actor:      QuoteActor;
  let canisterId: import("@dfinity/principal").Principal;

  let hvacRequestId:     string;
  let plumbingRequestId: string;
  let sealedRequestId:   string;

  beforeAll(async () => {
    pic = await createPic();
    const alice = createIdentity("alice");
    const bob   = createIdentity("bob");

    const fixture = await pic.setupCanister<QuoteActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: quoteIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);

    // Bootstrap alice as first admin (H-20: nonce-gated)
    await actor.setBootstrapNonce("test-nonce");
    ok(await actor.addAdmin(alice.getPrincipal(), "test-nonce"));
    // Grant alice Pro tier so she can create up to 10 open requests
    ok(await actor.setTier(alice.getPrincipal(), { Pro: null }));

    // 1. Regular HVAC request (no zipCode)
    const hvacReq: any = ok(await actor.createQuoteRequest(
      "PROP-001", { HVAC: null }, "Annual HVAC tune-up", { Medium: null }, []
    ));
    hvacRequestId = hvacReq.id;

    // 2. Plumbing request WITH zipCode (persistence probe)
    const plumbReq: any = ok(await actor.createQuoteRequest(
      "PROP-001", { Plumbing: null }, "Kitchen sink slow drain", { Low: null }, ["78701"]
    ));
    plumbingRequestId = plumbReq.id;

    // 3. Sealed-bid roofing request with a far-future close time
    const farFuture = BigInt("9999999999999999999");
    const sealedReq: any = ok(await actor.createSealedBidRequest(
      "PROP-001", { Roofing: null }, "Full roof replacement", { High: null }, farFuture, []
    ));
    sealedRequestId = sealedReq.id;

    // Bob submits a sealed bid on the roofing request
    actor.setIdentity(bob);
    ok(await actor.submitSealedBid(sealedRequestId, encodeCents(500_00), BigInt(30)));
    actor.setIdentity(alice);
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("all 3 requests survive upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    ok(await actor.getQuoteRequest(hvacRequestId));
    ok(await actor.getQuoteRequest(plumbingRequestId));
    ok(await actor.getQuoteRequest(sealedRequestId));
  });

  it("zipCode is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const req: any = ok(await actor.getQuoteRequest(plumbingRequestId));
    // Candid Opt(Text) → JavaScript [string] when present
    expect(req.zipCode).toEqual(["78701"]);
  });

  it("serviceType variant is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const hvac: any = ok(await actor.getQuoteRequest(hvacRequestId));
    expect(Object.keys(hvac.serviceType)[0]).toBe("HVAC");

    const plumb: any = ok(await actor.getQuoteRequest(plumbingRequestId));
    expect(Object.keys(plumb.serviceType)[0]).toBe("Plumbing");

    const roofing: any = ok(await actor.getQuoteRequest(sealedRequestId));
    expect(Object.keys(roofing.serviceType)[0]).toBe("Roofing");
  });

  it("sealed bid closeAt is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const req: any = ok(await actor.getQuoteRequest(sealedRequestId));
    // closeAt is Opt(Int) → [bigint] when set
    expect(req.closeAt.length).toBe(1);
  });

  it("sealed bid from bob survives upgrade", async () => {
    const bob = createIdentity("bob");
    actor.setIdentity(bob);

    const beforeBid: any = ok(await actor.getMyBid(sealedRequestId));
    expect(beforeBid.requestId).toBe(sealedRequestId);
    expect(beforeBid.timelineDays).toEqual(BigInt(30));

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const afterBid: any = ok(await actor.getMyBid(sealedRequestId));
    expect(afterBid.requestId).toBe(beforeBid.requestId);
    expect(afterBid.ciphertext).toEqual(beforeBid.ciphertext);
    expect(afterBid.timelineDays).toEqual(beforeBid.timelineDays);
  });

  it("metrics are preserved across upgrade", async () => {
    actor.setIdentity(createIdentity("alice"));
    const before = await actor.getMetrics();
    expect(Number(before.totalRequests)).toBe(3);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(Number(after.totalRequests)).toBe(Number(before.totalRequests));
    expect(after.isPaused).toBe(false);
  });
});
