/**
 * Calls that land in the same round. A canister handles one message at a
 * time, but every `await` lets other messages run before the caller resumes,
 * so a check made before an await can be stale by the time the write after it
 * happens. Each test here submits competing calls before any of them runs
 * (sameRound) and checks the invariant that must survive:
 *
 *  - tier limits hold (Free: 1 property, 3 open quote requests);
 *  - one address is one active property, also for the admin bulk import;
 *  - a homeowner accepts one quote per request;
 *  - a bearer invite link signs a job once;
 *  - a seller who hides the FSBO score keeps it hidden.
 *
 * Run: cd tests/upgrade && npx vitest run concurrency.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job,quote,listing,market}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, withMethods, unitResult, paymentIdlFactory, sameRound } from "./__helpers__/setup";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as jobIdl }      from "../../packages/shared/src/declarations/job";
import { idlFactory as quoteIdl }    from "../../packages/shared/src/declarations/quote";
import { idlFactory as listingIdl }  from "../../packages/shared/src/declarations/listing";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const oks = (rs: any[]) => rs.filter((r) => "ok" in r).length;

const bootstrap = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin:          I.Func([I.Principal, I.Text], [unitResult(I)], []),
});
const textSetters = (...names: string[]) => (I: any) =>
  Object.fromEntries(names.map((m) => [m, I.Func([I.Text], [unitResult(I)], [])]));
const principalSetters = (...names: string[]) => (I: any) =>
  Object.fromEntries(names.map((m) => [m, I.Func([I.Principal], [unitResult(I)], [])]));

const IDLS = {
  property: withMethods(propertyIdl, (I) => ({
    ...bootstrap(I),
    ...principalSetters("setPaymentCanisterId", "setJobCanisterId")(I),
    bulkRegisterProperties: I.Func([I.Vec(I.Record({
      address: I.Text, city: I.Text, state: I.Text, zipCode: I.Text,
      propertyType: I.Variant({ SingleFamily: I.Null, Condo: I.Null, Townhouse: I.Null, MultiFamily: I.Null }),
      yearBuilt: I.Nat, squareFeet: I.Nat,
      tier: I.Variant({ Free: I.Null, Pro: I.Null, ContractorFree: I.Null, ContractorPro: I.Null }),
    }))], [I.Record({ succeeded: I.Vec(I.Text), failed: I.Vec(I.Record({ index: I.Nat, reason: I.Text })) })], []),
  })),
  job:      withMethods(jobIdl, (I) => ({ ...bootstrap(I), ...textSetters("setPropertyCanisterId")(I) })),
  quote:    withMethods(quoteIdl, (I) => ({ ...bootstrap(I), ...principalSetters("setPaymentCanisterId", "setPropertyCanisterId")(I) })),
  listing:  withMethods(listingIdl, (I) => ({ ...bootstrap(I), ...textSetters("setPropertyCanisterId", "setJobCanisterId", "setMarketCanisterId")(I) })),
  // Only wired here; listing calls it. (packages/shared has no market declaration.)
  market:   ({ IDL: I }: { IDL: any }) => I.Service({ ...bootstrap(I), ...textSetters("setPropertyCanisterId", "setJobCanisterId", "setListingCanisterId")(I) }),
  payment:  paymentIdlFactory,
};
type Name = keyof typeof IDLS;

describe("same-round calls", () => {
  let pic: PocketIc;
  const ids: Record<string, any> = {};
  const main: Record<string, any> = {};
  let n = 0;

  const admin = createIdentity("cc-admin");
  const who = (tag: string) => createIdentity(`cc-${tag}-${++n}`);

  /** A new actor for `name` signed by `id`: each concurrent call needs its own. */
  const actor = (name: Name, id: Identity) => {
    const a = pic.createActor<any>(IDLS[name] as any, ids[name]);
    a.setIdentity(id);
    return a;
  };

  /** `calls` on canister `name`, all submitted before any runs. */
  const together = (name: Name, calls: { as: Identity; method: string; args: unknown[] }[]) =>
    sameRound(pic, IDLS[name] as any, ids[name], calls);

  const homeArgs = (address: string, tier = "Free") => ({
    address, city: "Orlando", state: "FL", zipCode: "32801",
    propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { [tier]: null },
  });

  async function grant(p: Identity, tier: string) {
    ok(await actor("payment", admin).grantSubscription(p.getPrincipal(), { [tier]: null }));
  }
  async function home(owner: Identity): Promise<string> {
    return ok<any>(await actor("property", owner).registerProperty(homeArgs(`${++n} Round Ave`, "Pro"))).id;
  }

  beforeAll(async () => {
    pic = await createPic();
    for (const name of Object.keys(IDLS) as Name[]) {
      const f = await pic.setupCanister({ idlFactory: IDLS[name] as any, wasm: wasmPath(name) });
      ids[name] = f.canisterId;
      main[name] = f.actor;
    }
    for (const name of ["property", "job", "quote", "listing", "market"] as Name[]) {
      await main[name].setBootstrapNonce("n");   // as the controller
      ok(await actor(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    await main.payment.setBootstrapNonce("n");
    ok(await actor("payment", admin).initAdmins([admin.getPrincipal()], "n"));

    const t = (name: Name) => ids[name].toText();
    ok(await actor("property", admin).setPaymentCanisterId(ids.payment));
    ok(await actor("property", admin).setJobCanisterId(ids.job));
    ok(await actor("job", admin).setPropertyCanisterId(t("property")));
    ok(await actor("quote", admin).setPaymentCanisterId(ids.payment));
    ok(await actor("quote", admin).setPropertyCanisterId(ids.property));
    ok(await actor("listing", admin).setPropertyCanisterId(t("property")));
    ok(await actor("listing", admin).setJobCanisterId(t("job")));
    ok(await actor("listing", admin).setMarketCanisterId(t("market")));
    ok(await actor("market", admin).setPropertyCanisterId(t("property")));
    ok(await actor("market", admin).setJobCanisterId(t("job")));
    ok(await actor("market", admin).setListingCanisterId(t("listing")));
  });

  afterAll(async () => { await pic?.tearDown(); });

  it("property: a Free user registering three homes at once gets one", async () => {
    const u = who("free-owner");
    const results = await together("property", [1, 2, 3].map((i) =>
      ({ as: u, method: "registerProperty", args: [homeArgs(`${++n} Free Way ${i}`)] })));
    expect(oks(results)).toBe(1);
    expect(await actor("property", u).getMyProperties()).toHaveLength(1);
  });

  it("property: two owners registering one address at once — one home", async () => {
    const [a, b] = [who("addr-a"), who("addr-b")];
    await grant(a, "Pro"); await grant(b, "Pro");
    const address = `${++n} Contested Ct`;
    const results = await together("property", [a, b].map((u) => ({ as: u, method: "registerProperty", args: [homeArgs(address, "Pro")] })));
    expect(oks(results)).toBe(1);
  });

  // Rows ahead of the contested one shift where its await falls, so one of
  // these offsets lines the bulk import's id await up with the registration.
  it.each([0, 1, 2, 3])("property: bulk import racing a registration of the same address (%i rows ahead) — one home", async (ahead) => {
    const owner = who("bulk-racer");
    await grant(owner, "Pro");
    const address = `${++n} Import Blvd`;
    const rows = [...Array.from({ length: ahead }, (_, i) => homeArgs(`${++n} Filler Rd ${i}`)), homeArgs(address)];
    const [bulk, single] = await together("property", [
      { as: admin, method: "bulkRegisterProperties", args: [rows] },
      { as: owner, method: "registerProperty", args: [homeArgs(address, "Pro")] },
    ]);
    const bulkGotIt = bulk.succeeded.length === rows.length;
    expect(Number(bulkGotIt) + Number("ok" in single)).toBe(1);
  });

  it("quote: a Free homeowner opening five requests at once gets three", async () => {
    const u = who("quote-owner");
    await grant(u, "Pro");                         // Pro to register the home…
    const prop = await home(u);
    ok(await actor("payment", admin).grantSubscription(u.getPrincipal(), { Free: null }));   // …then Free for the quote limit
    const results = await together("quote", [1, 2, 3, 4, 5].map((i) =>
      ({ as: u, method: "createQuoteRequest", args: [prop, { Plumbing: null }, `Leak ${i}`, { Medium: null }, [], [], [], [], []] })));
    expect(oks(results)).toBe(3);
  });

  it("quote: accepting two quotes on one request at once accepts one", async () => {
    const owner = who("accept-owner");
    await grant(owner, "Pro");
    const prop = await home(owner);
    const req = ok<any>(await actor("quote", owner).createQuoteRequest(prop, { HVAC: null }, "AC out", { High: null }, [], [], [], [], []));
    const validUntil = BigInt(await pic.getTime()) * 1_000_000n + 7n * 86_400n * 1_000_000_000n;
    const quotes = [];
    for (const c of [who("bidder"), who("bidder")]) {
      quotes.push(ok<any>(await actor("quote", c).submitQuote(req.id, 450_000n, 3n, validUntil)));
    }
    const results = await together("quote", quotes.map((q) => ({ as: owner, method: "acceptQuote", args: [q.id] })));
    expect(oks(results)).toBe(1);
    const statuses = await Promise.all(quotes.map(async (q) =>
      Object.keys(ok<any[]>(await actor("quote", owner).getQuotesForRequest(req.id)).find((x: any) => x.id === q.id)!.status)[0]));
    expect(statuses.filter((s) => s === "Accepted")).toHaveLength(1);
  });

  it("job: two contractors redeeming one invite link at once — one signs", async () => {
    const owner = who("invite-owner");
    await grant(owner, "Pro");
    const prop = await home(owner);
    const job = ok<any>(await actor("job", owner).createJob(prop, "New panel", { Electrical: null }, "200A upgrade.",
      ["Sparks LLC"], 250_000n, 0n, [], [], false, []));
    const token = ok<string>(await actor("job", owner).createInviteToken(job.id, ""));
    const contractors = [who("sparky"), who("sparky"), who("sparky")];
    const results = await together("job", contractors.map((c, i) =>
      ({ as: c, method: "redeemInviteToken", args: [token, `Sparks ${i}`, "555-0100", `s${i}@example.com`, []] })));
    expect(oks(results)).toBe(1);
    const after = ok<any>(await actor("job", owner).getJob(job.id));
    expect(after.contractorSigned).toBe(true);
  });

  it("listing: hiding the FSBO score while a 'show' is in flight keeps it hidden", async () => {
    const seller = who("fsbo-seller");
    await grant(seller, "Pro");
    const prop = await home(seller);
    // A verified job, so the market canister has a score to give.
    ok(await actor("job", seller).createJob(prop, "Roof", { Roofing: null }, "New roof.", [], 1_200_000n, 0n, [], [], true, []));
    ok(await actor("listing", seller).activateFsboListing({
      propertyId: prop, homeowner: seller.getPrincipal(), listPriceCents: 42_500_000n, activatedAt: 0n,
      address: `${n} Round Ave`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, bedrooms: 3n, bathrooms: 2n,
      verificationLevel: "Unverified", score: [], verifiedJobCount: 0n, hasPublicReport: false,
      description: [], photoUrl: [], systemHighlights: [],
    }));
    ok(await actor("listing", seller).setFsboScoreVisible(prop, false));

    // "Show" waits on the market canister, and a "hide" sent in the same round
    // can run during that wait. Which of two messages in one round runs first
    // isn't fixed, so try a few times: every attempt must end consistent (the
    // public score is empty exactly when the seller's flag says hidden), and
    // at least one must have interleaved ("show" saw the "hide").
    let interleaved = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const [shown, hidden] = await together("listing", [
        { as: seller, method: "setFsboScoreVisible", args: [prop, true] },
        { as: seller, method: "setFsboScoreVisible", args: [prop, false] },
      ]);
      ok(shown); ok(hidden);
      if ((shown as any).ok.score.length === 0) interleaved++;
      const isHidden = await actor("listing", seller).isFsboScoreHidden(prop);
      const publicView = (await actor("listing", who("buyer")).getFsboListing(prop))[0];
      expect({ attempt, isHidden, publicScore: publicView.score.length > 0 })
        .toEqual({ attempt, isHidden, publicScore: !isHidden });
    }
    expect(interleaved).toBeGreaterThan(0);
  });
});
