/**
 * Sealed bids end to end, with real vetKD: contractors encrypt their amounts
 * to the request with the frontend's own IBE helpers (services/sealedBid.ts),
 * the quote canister stores the ciphertexts, and after the window closes the
 * homeowner derives the request's key through revealBidsEncrypted and opens
 * them in the browser. quote, payment, property and contractor are wired as
 * deploy.sh wires them; the instance has an II subnet so the threshold keys
 * (test_key_1, the canister's default) exist.
 *
 * Run: cd tests/upgrade && npx vitest run quote-sealed-bid.canister.test.ts
 * (needs .dfx/local/canisters/{quote,payment,property,contractor}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { TransportSecretKey } from "@dfinity/vetkeys";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { ibeEncryptAmount, ibeDecryptBids, sealedBidIdentity } from "../../frontend/src/services/sealedBid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const errText = (r: R<unknown>) => ("err" in r ? JSON.stringify(r.err) : "ok");

const CANISTERS = ["quote", "payment", "property", "contractor"] as const;
type Name = typeof CANISTERS[number];
const HOUR_MS = 60 * 60 * 1000;

describe("quote: sealed bids with real vetKD", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";
  let pubKey = new Uint8Array();

  const admin    = createIdentity("sb-admin");
  const owner    = createIdentity("sb-owner");
  const stranger = createIdentity("sb-stranger");
  const c1 = createIdentity("sb-c1");
  const c2 = createIdentity("sb-c2");
  const c3 = createIdentity("sb-c3");
  const unregistered = createIdentity("sb-unregistered");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;

  async function openRequest(description: string): Promise<string> {
    const closeAt = (await nowNs()) + BigInt(HOUR_MS) * 1_000_000n;
    return ok<any>(await as("quote", owner).createSealedBidRequest(
      propertyId, { Roofing: null }, description, { High: null }, closeAt, [], [], [], [], [],
    )).id;
  }
  const bid = async (who: Identity, requestId: string, cents: number, days = 14n) =>
    as("quote", who).submitSealedBid(requestId, await ibeEncryptAmount(pubKey, sealedBidIdentity(requestId), cents), days);

  /** The browser's reveal: a fresh transport key, the canister derives, we decrypt. */
  async function reveal(who: Identity, requestId: string, identityFor = requestId) {
    const tsk = TransportSecretKey.random();
    const res = await as("quote", who).revealBidsEncrypted(requestId, tsk.publicKeyBytes());
    if ("err" in res) return { err: res.err } as const;
    const raw = res.ok.bids.map((b: any) => ({
      id: b.id, requestId: b.requestId, contractor: b.contractor.toText(),
      ciphertext: Array.from(b.ciphertext as Uint8Array), timelineDays: Number(b.timelineDays), submittedAt: b.submittedAt,
    }));
    return { ok: await ibeDecryptBids(new Uint8Array(res.ok.encryptedKey), pubKey, sealedBidIdentity(identityFor), tsk, raw) } as const;
  }

  beforeAll(async () => {
    pic = await createPic({
      ii: { state: { type: SubnetStateType.New } },
      application: [{ state: { type: SubnetStateType.New } }],
    });
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      const addArgs = methods.get("addAdmin")!.argTypes.length === 2 ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()];
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(...addArgs));
    }
    ok(await as("quote", admin).setPaymentCanisterId(ids.payment));
    ok(await as("quote", admin).setPropertyCanisterId(ids.property));
    ok(await as("quote", admin).setContractorCanisterId(ids.contractor));
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));

    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "4 Oak Lane", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2001n, squareFeet: 2100n, tier: { Pro: null },
    })).id;
    for (const [who, name] of [[c1, "Ace Roofing"], [c2, "Best Roofs"], [c3, "Crown Roofing"]] as const) {
      ok(await as("contractor", who).register({ name, specialties: [{ Roofing: null }], email: "c@example.com", phone: "+14075550100" }));
    }
    pubKey = new Uint8Array(await as("quote", c1).getIbePublicKey());
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  it("uses the canister's threshold key, not the mock", async () => {
    expect(await as("quote", owner).getVetkdKeyName()).toBe("test_key_1");
    expect(pubKey.length).toBeGreaterThan(0);
  });

  it("refuses bids from the homeowner, an unregistered caller and a second bid from the same contractor", async () => {
    const req = await openRequest("Roof A");
    expect(errKey(await bid(owner, req, 1_000_00))).toBe("NotAuthorized");
    expect(errKey(await bid(unregistered, req, 1_000_00))).toBe("NotAuthorized");
    ok(await bid(c1, req, 1_000_00));
    expect(errText(await bid(c1, req, 900_00))).toMatch(/already have a sealed bid/);
  });

  it("hides amounts until the window closes, then only the homeowner can open them", async () => {
    const req = await openRequest("Roof B");
    ok(await bid(c1, req, 12_500_00, 10n));
    ok(await bid(c2, req, 9_800_00, 21n));
    ok(await bid(c3, req, 11_000_00, 14n));

    // The canister never sees an amount: the mock path is off and the stored
    // bid is ciphertext, not the 4-byte encoding.
    expect(errText(await as("quote", owner).revealBids(req))).toMatch(/Mock reveal is disabled/);
    const stored = ok<any>(await as("quote", c2).getMyBid(req));
    expect(stored.ciphertext.length).toBeGreaterThan(4);

    expect(errText(await reveal(owner, req) as any)).toMatch(/not yet closed/);

    await pic.advanceTime(HOUR_MS + 1000);
    await pic.tick();

    expect(errText(await bid(c3, req, 1_00) as any)).toMatch(/already have a sealed bid|closed/);
    expect(errKey(await reveal(stranger, req) as any)).toBe("NotAuthorized");
    expect(errKey(await reveal(c1, req) as any)).toBe("NotAuthorized");

    const opened = ok<any[]>(await reveal(owner, req) as any);
    const byContractor = Object.fromEntries(opened.map((b) => [b.contractor, [b.amountCents, b.timelineDays, b.isWinner]]));
    expect(byContractor).toEqual({
      [c1.getPrincipal().toText()]: [12_500_00, 10, false],
      [c2.getPrincipal().toText()]: [9_800_00, 21, true],
      [c3.getPrincipal().toText()]: [11_000_00, 14, false],
    });
  });

  it("refuses new bids once the window has closed", async () => {
    const req = await openRequest("Roof C");
    await pic.advanceTime(HOUR_MS + 1000);
    await pic.tick();
    expect(errText(await bid(c1, req, 5_000_00))).toMatch(/closed/);
  });

  it("derives one key per request: a request's key can't open another request's bids", async () => {
    const reqA = await openRequest("Roof D");
    const reqB = await openRequest("Roof E");
    ok(await bid(c1, reqA, 7_000_00));
    ok(await bid(c1, reqB, 8_000_00));
    await pic.advanceTime(HOUR_MS + 1000);
    await pic.tick();

    // The key for A, checked against B's identity, fails verification.
    await expect(reveal(owner, reqA, reqB)).rejects.toThrow();
    // A's key, used on B's ciphertext, doesn't decrypt.
    const tsk = TransportSecretKey.random();
    const resA = ok<any>(await as("quote", owner).revealBidsEncrypted(reqA, tsk.publicKeyBytes()));
    const resB = ok<any>(await as("quote", owner).revealBidsEncrypted(reqB, TransportSecretKey.random().publicKeyBytes()));
    const rawB = resB.bids.map((b: any) => ({
      id: b.id, requestId: b.requestId, contractor: b.contractor.toText(),
      ciphertext: Array.from(b.ciphertext as Uint8Array), timelineDays: Number(b.timelineDays), submittedAt: b.submittedAt,
    }));
    await expect(ibeDecryptBids(new Uint8Array(resA.encryptedKey), pubKey, sealedBidIdentity(reqA), tsk, rawB)).rejects.toThrow();

    expect(ok<any[]>(await reveal(owner, reqB) as any).map((b) => b.amountCents)).toEqual([8_000_00]);
  });
});
