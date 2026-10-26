/**
 * Account deletion (deleteMyData) in the property, job and quote canisters:
 * the caller's records go, everyone else's stay. (listing and report are
 * covered in their own canister tests.)
 *
 * Run: cd tests/upgrade && npx vitest run account-deletion.canister.test.ts
 * (needs .dfx/local/canisters/{property,job,quote}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as jobIdl }      from "../../packages/shared/src/declarations/job";
import { idlFactory as quoteIdl }    from "../../packages/shared/src/declarations/quote";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => {
  if (!("err" in r)) throw new Error("Expected err, got ok");
  return Object.keys(r.err)[0];
};

describe("account deletion", () => {
  let pic: PocketIc;
  let property: any;
  let job: any;
  let quote: any;

  const alice = createIdentity("del-alice");   // deletes her account
  const bob   = createIdentity("del-bob");
  const carol = createIdentity("del-carol");

  const register = (address: string) => property.registerProperty({
    address, city: "Orlando", state: "FL", zipCode: "32801",
    propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
  });

  beforeAll(async () => {
    pic = await createPic();
    // Unwired: job and quote fall back to "the caller owns the property".
    property = (await pic.setupCanister({ idlFactory: propertyIdl as any, wasm: wasmPath("property") })).actor;
    job      = (await pic.setupCanister({ idlFactory: jobIdl as any,      wasm: wasmPath("job") })).actor;
    quote    = (await pic.setupCanister({ idlFactory: quoteIdl as any,    wasm: wasmPath("quote") })).actor;
  });

  afterAll(async () => { await pic?.tearDown(); });

  it("property: removes the caller's homes and frees the address", async () => {
    property.setIdentity(alice);
    const mine = ok<any>(await register("1 Oak Lane")).id;
    property.setIdentity(bob);
    const bobs = ok<any>(await register("2 Oak Lane")).id;

    property.setIdentity(alice);
    expect(Number(ok(await property.deleteMyData()))).toBeGreaterThanOrEqual(1);
    expect(await property.getMyProperties()).toEqual([]);
    expect(await property.getPropertyOwner(mine)).toEqual([]);

    property.setIdentity(bob);
    expect((await property.getMyProperties()).map((p: any) => p.id)).toEqual([bobs]);

    // Someone else can now register the address straight away.
    property.setIdentity(carol);
    const carols = ok<any>(await register("1 Oak Lane"));
    expect(carols.address).toBe("1 Oak Lane");
    expect(Object.keys(carols.verificationLevel)[0]).toBe("Unverified");
  });

  it("job: removes the caller's records and leaves other homeowners' alone", async () => {
    const make = (title: string) => job.createJob("PROP-" + title, title, { Plumbing: null }, "Work done.", [], 0n, 0n, [], [], true, []);
    job.setIdentity(alice);
    const a1 = ok<any>(await make("a1")).id;
    const a2 = ok<any>(await make("a2")).id;
    job.setIdentity(bob);
    const b1 = ok<any>(await make("b1")).id;

    job.setIdentity(alice);
    expect(ok(await job.deleteMyData())).toBe(2n);
    expect(errKey(await job.getJob(a1))).toBe("NotFound");
    expect(errKey(await job.getJob(a2))).toBe("NotFound");
    expect(ok(await job.deleteMyData())).toBe(0n);   // nothing left; still fine

    job.setIdentity(bob);
    expect(ok<any>(await job.getJob(b1)).title).toBe("b1");
  });

  it("quote: removes the caller's requests (with the bids on them) and open bids, keeps others'", async () => {
    const validUntil = BigInt(await pic.getTime() + 7 * 86_400_000) * 1_000_000n;
    const request = (pid: string) => quote.createQuoteRequest(pid, { Roofing: null }, "Roof leak", { High: null }, ["32801"], [], [], [], []);

    quote.setIdentity(alice);
    const aliceReq = ok<any>(await request("PROP-A")).id;
    quote.setIdentity(bob);
    const bobReq = ok<any>(await request("PROP-B")).id;

    // carol bids on both; alice bids on bob's request as a contractor.
    quote.setIdentity(carol);
    ok(await quote.submitQuote(aliceReq, 900_000n, 5n, validUntil));
    const carolOnBob = ok<any>(await quote.submitQuote(bobReq, 950_000n, 5n, validUntil)).id;
    quote.setIdentity(alice);
    ok(await quote.submitQuote(bobReq, 800_000n, 4n, validUntil));

    quote.setIdentity(alice);
    ok(await quote.deleteMyData());
    expect(await quote.getMyQuoteRequests()).toEqual([]);
    expect(await quote.getMyQuotes()).toEqual([]);

    quote.setIdentity(bob);
    const left = ok<any[]>(await quote.getQuotesForRequest(bobReq));
    expect(left.map((q) => q.id)).toEqual([carolOnBob]);     // alice's open bid went, carol's stayed
    expect(errKey(await quote.getQuoteRequest(aliceReq))).toBe("NotFound");

    quote.setIdentity(carol);
    expect((await quote.getMyQuotes()).map((q: any) => q.requestId)).toEqual([bobReq]);   // her bid on alice's request went with it
  });
});
