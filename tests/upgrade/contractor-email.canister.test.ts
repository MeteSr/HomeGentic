/**
 * Contractor emails aren't public. Profile and directory reads blank the
 * email (and alert email) for everyone but the contractor, admins, trusted
 * canisters and the relays; getContractorEmail returns it to a homeowner who
 * has worked with the contractor: a job logged with them, or a bid from them
 * on a request that's no longer open. Real contractor, job, quote, property
 * and payment canisters, wired as deploy.sh wires them.
 *
 * Run: cd tests/upgrade && npx vitest run contractor-email.canister.test.ts
 * (needs .dfx/local/canisters/{contractor,job,quote,property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["contractor", "job", "quote", "property", "payment"] as const;
type Name = typeof CANISTERS[number];
const DAY_NS = 86_400n * 1_000_000_000n;
const EMAIL = "pat@example.com";

describe("contractor emails", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;

  const admin    = createIdentity("ce-admin");
  const pro      = createIdentity("ce-contractor");
  const hired    = createIdentity("ce-hired");     // logged a job with pro
  const bidOn    = createIdentity("ce-bid-on");    // took pro's bid, then accepted one
  const stranger = createIdentity("ce-stranger");
  const relay    = createIdentity("ce-relay");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const home = async (owner: Identity, street: string) => {
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    return ok<any>(await as("property", owner).registerProperty({
      address: street, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2005n, squareFeet: 1800n, tier: { Pro: null },
    })).id as string;
  };

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).setContractorCanisterId(ids.contractor.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.contractor));
    ok(await as("job", admin).addTrustedCanister(ids.property));
    ok(await as("quote", admin).setPropertyCanisterId(ids.property));
    ok(await as("quote", admin).setPaymentCanisterId(ids.payment));
    ok(await as("quote", admin).setContractorCanisterId(ids.contractor));
    ok(await as("contractor", admin).setJobCanisterId(ids.job.toText()));
    ok(await as("contractor", admin).setQuoteCanisterId(ids.quote.toText()));
    ok(await as("contractor", admin).addNotifier(relay.getPrincipal()));

    ok(await as("contractor", pro).register({ name: "Pat Plumbing", specialties: [{ Plumbing: null }], email: EMAIL, phone: "+14075550123" }));
    ok(await as("contractor", pro).updateNotificationPrefs({ notifyEmail: ["alerts@example.com"], notifyPush: [], alertZips: [] }));
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  it("blanks the email in profile and directory reads by the public", async () => {
    for (const who of [stranger, new AnonymousIdentity() as Identity]) {
      const p = ok<any>(await as("contractor", who).getContractor(pro.getPrincipal()));
      expect([p.email, p.notifyEmail]).toEqual(["", []]);
      expect(p.phone).toBe("+14075550123");
    }
    for (const list of [
      await as("contractor", stranger).getAll(),
      await as("contractor", stranger).getPage(0n, 10n),
      await as("contractor", stranger).getBySpecialty({ Plumbing: null }),
    ]) {
      expect(list.map((c: any) => c.email)).toEqual([""]);
    }
    expect(errKey(await as("contractor", stranger).getContractorEmail(pro.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("contractor", new AnonymousIdentity() as Identity).getContractorEmail(pro.getPrincipal()))).toBe("NotAuthorized");
  });

  it("shows it to the contractor, admins and the notification relay", async () => {
    for (const who of [pro, admin, relay]) {
      const p = ok<any>(await as("contractor", who).getContractor(pro.getPrincipal()));
      expect([p.email, p.notifyEmail]).toEqual([EMAIL, ["alerts@example.com"]]);
      expect(ok(await as("contractor", who).getContractorEmail(pro.getPrincipal()))).toBe(EMAIL);
    }
    expect(errKey(await as("contractor", stranger).addNotifier(stranger.getPrincipal()))).toBe("NotAuthorized");
  });

  it("gives it to a homeowner who logged a job with the contractor", async () => {
    const prop = await home(hired, "1 Elm St");
    const done = BigInt(await pic.getTime()) * 1_000_000n - 30n * DAY_NS;
    const proposal = ok<any>(await as("job", pro).createJobProposal(prop, "Repipe", { Plumbing: null }, "PEX repipe.", ["Pat Plumbing"], 9_500_00n, done, [], []));
    expect(errKey(await as("contractor", hired).getContractorEmail(pro.getPrincipal()))).toBe("NotAuthorized");
    ok(await as("job", hired).approveJobProposal(proposal.id));
    expect(ok(await as("contractor", hired).getContractorEmail(pro.getPrincipal()))).toBe(EMAIL);
    // The profile read itself stays redacted for them.
    expect(ok<any>(await as("contractor", hired).getContractor(pro.getPrincipal())).email).toBe("");
  });

  it("gives it to a homeowner who took the contractor's bid, once the request stops taking bids", async () => {
    const prop = await home(bidOn, "2 Oak St");
    const req = ok<any>(await as("quote", bidOn).createQuoteRequest(prop, { Plumbing: null }, "Leak under sink", { High: null }, [], [], [], [], []));
    const validUntil = BigInt(await pic.getTime()) * 1_000_000n + 7n * DAY_NS;
    const bid = ok<any>(await as("quote", pro).submitQuote(req.id, 45_000n, 2n, validUntil));
    // Still open: held back, as the app holds contact details back.
    expect(errKey(await as("contractor", bidOn).getContractorEmail(pro.getPrincipal()))).toBe("NotAuthorized");
    ok(await as("quote", bidOn).acceptQuote(bid.id));
    expect(ok(await as("contractor", bidOn).getContractorEmail(pro.getPrincipal()))).toBe(EMAIL);
    // Someone else with no bid from this contractor still can't.
    expect(errKey(await as("contractor", hired).getContractorEmail(createIdentity("ce-other").getPrincipal()))).toBe("NotFound");
  });

  it("won't answer the relationship checks for anyone but the contractor canister", async () => {
    expect(await as("job", stranger).hasJobWithContractor(hired.getPrincipal(), pro.getPrincipal())).toBe(false);
    expect(await as("quote", stranger).hasBidFrom(bidOn.getPrincipal(), pro.getPrincipal())).toBe(false);
  });
});
