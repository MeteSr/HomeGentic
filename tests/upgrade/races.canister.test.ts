/**
 * More same-round races: calls submitted together so each one's await on
 * another canister lets the others run in between, which is where a check
 * made before an await goes stale. Each test is a guard that re-reads state
 * after its await (see the TOCTOU comments in the canisters); without the
 * re-read the invariant named in the test breaks. concurrency.canister.test.ts
 * holds the first set.
 *
 * Run: cd tests/upgrade && npx vitest run races.canister.test.ts
 * (needs .dfx/local/canisters/<name>/<name>.wasm for the canisters below)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createHash } from "crypto";
import { createPic, wasmPath, CONTROLLER, sameRound } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const oks = (rs: R<unknown>[]) => rs.filter((r) => "ok" in r).length;

const CANISTERS = ["property", "payment", "job", "contractor", "quote", "photo", "sensor", "bills", "recurring"] as const;
type Name = typeof CANISTERS[number];

describe("same-round races (second set)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let n = 0;

  const admin = createIdentity("rc2-admin");
  const who = (tag: string) => createIdentity(`rc2-${tag}-${++n}`);

  const as = (name: Name, id: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(id);
    return a;
  };
  const together = (name: Name, calls: { as: Identity; method: string; args: unknown[] }[]) =>
    sameRound(pic, (() => svcs[name]) as any, ids[name], calls);
  /** Wire `name`.`setter` to `target`, as Text or Principal, whichever the setter takes. */
  async function wire(name: Name, setter: string, target: Name) {
    const arg = new Map(svcs[name]._fields).get(setter)!.argTypes[0];
    ok(await as(name, admin)[setter](arg.name === "principal" ? ids[target] : ids[target].toText()));
  }
  async function proHome(owner: Identity): Promise<string> {
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    return ok<any>(await as("property", owner).registerProperty({
      address: `${++n} Race Road`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2001n, squareFeet: 1600n, tier: { Pro: null },
    })).id;
  }
  async function contractor(tag: string): Promise<Identity> {
    const c = who(tag);
    ok(await as("contractor", c).register({ name: `Contractor ${n}`, specialties: [{ Plumbing: null }], email: "c@example.com", phone: "+14075550199" }));
    return c;
  }

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
    // deploy.sh's wiring, for the canisters here.
    await wire("property", "setPaymentCanisterId", "payment");
    for (const name of ["job", "quote", "photo", "sensor", "bills", "recurring"] as const) await wire(name, "setPropertyCanisterId", "property");
    for (const name of ["quote", "photo", "bills"] as const) await wire(name, "setPaymentCanisterId", "payment");
    await wire("job", "setContractorCanisterId", "contractor");
    await wire("quote", "setContractorCanisterId", "contractor");
    await wire("contractor", "setJobCanisterId", "job");
    ok(await as("job", admin).addTrustedCanister(ids.contractor));
    ok(await as("property", admin).addTrustedCanister(ids.quote));
    ok(await as("property", admin).addTrustedCanister(ids.photo));
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  describe("job", () => {
    it("a contractor sending five proposals at once still gets only three pending", async () => {
      const owner = who("job-owner");
      const prop = await proHome(owner);
      const c = await contractor("job-c");
      const t = BigInt(await pic.getTime() - 30 * 86_400_000) * 1_000_000n;
      const rs = await together("job", [0, 1, 2, 3, 4].map((i) => ({
        as: c, method: "createJobProposal",
        args: [prop, `Fix ${i}`, { Plumbing: null }, "Fixed a leak.", ["Contractor"], 25_000n, t, [], []],
      })));
      expect(oks(rs)).toBe(3);
    });

    it("approving and rejecting one proposal at once does exactly one", async () => {
      const owner = who("job-owner");
      const prop = await proHome(owner);
      const c = await contractor("job-c");
      const t = BigInt(await pic.getTime() - 30 * 86_400_000) * 1_000_000n;
      const p = ok<any>(await as("job", c).createJobProposal(prop, "Water heater", { Plumbing: null }, "New heater.", ["Contractor"], 90_000n, t, [], []));
      const [approve, reject] = await together("job", [
        { as: owner, method: "approveJobProposal", args: [p.id] },
        { as: owner, method: "rejectJobProposal", args: [p.id] },
      ]);
      expect(oks([approve, reject])).toBe(1);
      const after = await as("job", owner).getJob(p.id);
      // Approved: the record stays, out of the proposal state. Rejected: gone.
      if ("ok" in approve) expect(Object.keys(ok<any>(after).status)[0]).toBe("Pending");
      else expect(Object.keys(after.err)[0]).toBe("NotFound");
    });

    it("asking for the inbox address twice at once gives one address", async () => {
      const owner = who("job-inbox");
      await proHome(owner);
      const rs = await together("job", [0, 1, 2].map(() => ({ as: owner, method: "getMyInboxToken", args: [] })));
      expect(new Set(rs.map((r: any) => ok<string>(r))).size).toBe(1);
    });
  });

  describe("quote", () => {
    it("closing and cancelling one request at once does exactly one", async () => {
      const owner = who("q-owner");
      const prop = await proHome(owner);
      const req = ok<any>(await as("quote", owner).createQuoteRequest(prop, { Plumbing: null }, "Leaky faucet", { Low: null }, [], [], [], [], []));
      const rs = await together("quote", [
        { as: owner, method: "closeQuoteRequest", args: [req.id] },
        { as: owner, method: "cancelQuoteRequest", args: [req.id] },
      ]);
      expect(oks(rs)).toBe(1);
    });

    it("a contractor submitting the same quote twice at once has one pending quote", async () => {
      const owner = who("q-owner");
      const prop = await proHome(owner);
      const c = await contractor("q-c");
      const req = ok<any>(await as("quote", owner).createQuoteRequest(prop, { Plumbing: null }, "Repipe", { Medium: null }, [], [], [], [], []));
      const until = BigInt(await pic.getTime() + 30 * 86_400_000) * 1_000_000n;
      const rs = await together("quote", [0, 1].map(() => ({ as: c, method: "submitQuote", args: [req.id, 400_000n, 7n, until] })));
      expect(oks(rs)).toBe(1);
    });

    it("a contractor sending two sealed bids at once has one", async () => {
      const owner = who("q-owner");
      const prop = await proHome(owner);
      const c = await contractor("q-c");
      const closeAt = BigInt(await pic.getTime() + 86_400_000) * 1_000_000n;
      const req = ok<any>(await as("quote", owner).createSealedBidRequest(prop, { Plumbing: null }, "Sealed repipe", { Medium: null }, closeAt, [], [], [], [], []));
      const rs = await together("quote", [1, 2].map((b) => ({ as: c, method: "submitSealedBid", args: [req.id, new Uint8Array(40).fill(b), 10n] })));
      expect(oks(rs)).toBe(1);
    });
  });

  describe("photo", () => {
    it("the same image uploaded twice at once is stored once", async () => {
      const owner = who("ph-owner");
      const prop = await proHome(owner);
      const bytes = new Uint8Array([9, 8, 7, 6, ++n]);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const rs = await together("photo", [0, 1].map(() => ({ as: owner, method: "uploadPhoto", args: ["JOB_R", prop, { Finishing: null }, "", hash, bytes] })));
      expect(oks(rs)).toBe(1);
      expect(Object.keys((rs.find((r: any) => "err" in r) as any).err)[0]).toBe("Duplicate");
    });

    it("a Free user's six uploads at once to one job keep the five-photo limit", async () => {
      const owner = who("ph-free");
      const prop = ok<any>(await as("property", owner).registerProperty({
        address: `${++n} Free Lane`, city: "Orlando", state: "FL", zipCode: "32801",
        propertyType: { SingleFamily: null }, yearBuilt: 2001n, squareFeet: 1600n, tier: { Free: null },
      })).id;
      const rs = await together("photo", [0, 1, 2, 3, 4, 5].map((i) => {
        const bytes = new Uint8Array([1, 2, i, ++n]);
        return { as: owner, method: "uploadPhoto", args: ["JOB_F", prop, { Finishing: null }, "", createHash("sha256").update(bytes).digest("hex"), bytes] };
      }));
      expect(oks(rs)).toBe(5);
    });
  });

  describe("sensor", () => {
    it("one device id registered twice at once binds one device", async () => {
      const owner = who("s-owner");
      const prop = await proHome(owner);
      const rs = await together("sensor", [0, 1].map(() => ({ as: owner, method: "registerDevice", args: [prop, `ecobee-${n}`, { Ecobee: null }, "Hall thermostat"] })));
      expect(oks(rs)).toBe(1);
      expect((await as("sensor", owner).getDevicesForProperty(prop)).length).toBe(1);
    });
  });

  describe("bills", () => {
    it("an edit racing a delete doesn't bring the expense back", async () => {
      const owner = who("b-owner");
      const prop = await proHome(owner);
      const fields = { category: { HOA: null }, provider: "Lakes HOA", amountCents: 12_000n, frequency: { Monthly: null }, startDate: "2026-01-01", endDate: [] };
      const exp = ok<any>(await as("bills", owner).addRecurringExpense(prop, fields));
      const [edit, del] = await together("bills", [
        { as: owner, method: "updateRecurringExpense", args: [exp.id, { ...fields, amountCents: 15_000n }] },
        { as: owner, method: "deleteRecurringExpense", args: [exp.id] },
      ]);
      ok(del);
      expect(Object.keys((edit as any).err ?? {})[0]).toBe("NotFound");
      expect(ok<any[]>(await as("bills", owner).getRecurringExpensesForProperty(prop))).toEqual([]);
    });
  });

  describe("recurring", () => {
    it("a cancelled service isn't un-cancelled by a pause sent at the same time", async () => {
      const owner = who("r-owner");
      const prop = await proHome(owner);
      const svc = ok<any>(await as("recurring", owner).createRecurringService(prop, { LawnCare: null }, "Green Co", [], [], { Monthly: null }, "2026-01-01", [], []));
      const rs = await together("recurring", [
        { as: owner, method: "updateStatus", args: [svc.id, { Cancelled: null }] },
        { as: owner, method: "updateStatus", args: [svc.id, { Paused: null }] },
      ]);
      ok(rs[0]);
      // The pause either lands first (and the cancel then wins) or finds the
      // service already cancelled; either way it ends cancelled.
      if ("err" in rs[1]) expect(Object.keys(rs[1].err)[0]).toBe("AlreadyCancelled");
      expect(Object.keys(ok<any>(await as("recurring", owner).getRecurringService(svc.id)).status)[0]).toBe("Cancelled");
    });
  });
});
