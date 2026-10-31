/**
 * Who may touch a home, end to end on real canisters: ownership transfer,
 * property managers and approval requests.
 *
 * property owns the roles; job, bills and recurring ask it live
 * (isAuthorized / getAccessRole) on every call. So these tests check each
 * role change from the other canisters' side too: a seller, a removed
 * manager or a resigned viewer must lose access everywhere at once.
 *
 * Run: cd tests/upgrade && npx vitest run property-access.canister.test.ts
 * (needs .dfx/local/canisters/{property,job,bills,recurring,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, withMethods, unitResult, paymentIdlFactory, sameRound } from "./__helpers__/setup";
import { idlFactory as propertyIdl }  from "../../packages/shared/src/declarations/property";
import { idlFactory as jobIdl }       from "../../packages/shared/src/declarations/job";
import { idlFactory as billsIdl }     from "../../packages/shared/src/declarations/bills";
import { idlFactory as recurringIdl } from "../../packages/shared/src/declarations/recurring";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const DAY_MS = 24 * 60 * 60 * 1000;

const bootstrap = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin:          I.Func([I.Principal, I.Text], [unitResult(I)], []),
});

const propertyTestIdl = withMethods(propertyIdl, (I) => ({
  ...bootstrap(I),
  setPaymentCanisterId: I.Func([I.Principal], [unitResult(I)], []),
  setJobCanisterId:     I.Func([I.Principal], [unitResult(I)], []),
}));

const paymentIdl = withMethods(paymentIdlFactory, (I) => ({
  addTrustedCanister: I.Func([I.Principal], [unitResult(I)], []),
  getMyHandoffGrant:  I.Func([], [I.Opt(I.Int)], ["query"]),
}));

describe("property access across canisters", () => {
  let pic: PocketIc;
  let propertyCid: any;
  let property: any, job: any, bills: any, recurring: any, pay: any;
  let n = 0;

  const admin = createIdentity("pa-admin");

  async function bootstrapAdmin(actor: any) {
    await actor.setBootstrapNonce("n");   // as the controller
    actor.setIdentity(admin);
    ok(await actor.addAdmin(admin.getPrincipal(), "n"));
  }

  /** A fresh Pro identity (Pro: managers, bills and more than one home). */
  async function proUser(name: string): Promise<Identity> {
    const id = createIdentity(`pa-${name}-${++n}`);
    pay.setIdentity(admin);
    ok(await pay.grantSubscription(id.getPrincipal(), { Pro: null }));
    return id;
  }

  async function register(owner: Identity): Promise<string> {
    property.setIdentity(owner);
    const r = await property.registerProperty({
      address: `${++n} Access Lane`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Pro: null },
    });
    return ok<any>(r).id as string;
  }

  const as = <A extends { setIdentity(i: Identity): void }>(a: A, who: Identity) => { a.setIdentity(who); return a; };

  const createJob = (who: Identity, propertyId: string) =>
    as(job, who).createJob(propertyId, "Water heater", { Plumbing: null }, "Replaced it.", [], 0n, 0n, [], [], true, []);
  const addBill = (who: Identity, propertyId: string) =>
    as(bills, who).addBill({
      propertyId, billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
      periodEnd: "2026-09-30", amountCents: 12_000n, usageAmount: [], usageUnit: [],
    });
  const createService = (who: Identity, propertyId: string) =>
    as(recurring, who).createRecurringService(propertyId, { LawnCare: null }, "Green Co", [], [], { Monthly: null }, "2026-01-01", [], []);
  const role = async (propertyId: string, who: Identity) =>
    Object.keys((await property.getAccessRole(propertyId, who.getPrincipal()))[0] ?? { none: null })[0];

  /** Everything `who` can do on `propertyId` through the other canisters. */
  async function reach(who: Identity, propertyId: string) {
    const jobs = ok<any[]>(await as(job, who).getJobsForProperty(propertyId));
    const services = await as(recurring, who).getByProperty(propertyId);
    return {
      role:        await role(propertyId, who),
      readsJobs:   jobs.length > 0,
      readsSched:  services.length > 0,
      writesJob:   errOf(await createJob(who, propertyId)),
      writesBill:  errOf(await addBill(who, propertyId)),
    };
  }

  beforeAll(async () => {
    pic = await createPic();
    const p = await pic.setupCanister({ idlFactory: propertyTestIdl as any, wasm: wasmPath("property") });
    const j = await pic.setupCanister({ idlFactory: withMethods(jobIdl, bootstrap) as any, wasm: wasmPath("job") });
    const b = await pic.setupCanister({
      idlFactory: withMethods(billsIdl, (I) => ({
        ...bootstrap(I),
        setPropertyCanisterId: I.Func([I.Text], [unitResult(I)], []),
        setPaymentCanisterId:  I.Func([I.Text], [unitResult(I)], []),
      })) as any,
      wasm: wasmPath("bills"),
    });
    const r = await pic.setupCanister({
      idlFactory: withMethods(recurringIdl, (I) => ({
        ...bootstrap(I),
        setPropertyCanisterId: I.Func([I.Principal], [unitResult(I)], []),
      })) as any,
      wasm: wasmPath("recurring"),
    });
    const pm = await pic.setupCanister({ idlFactory: paymentIdl as any, wasm: wasmPath("payment") });
    propertyCid = p.canisterId;
    property = p.actor; job = j.actor; bills = b.actor; recurring = r.actor; pay = pm.actor;

    for (const a of [property, job, bills, recurring]) await bootstrapAdmin(a);
    await pay.setBootstrapNonce("n");
    pay.setIdentity(admin);
    ok(await pay.initAdmins([admin.getPrincipal()], "n"));
    ok(await pay.addTrustedCanister(p.canisterId));   // property grants the buyer's handoff year

    ok(await property.setPaymentCanisterId(pm.canisterId));
    ok(await property.setJobCanisterId(j.canisterId));
    ok(await job.setPropertyCanisterId(p.canisterId.toText()));
    ok(await bills.setPropertyCanisterId(p.canisterId.toText()));
    ok(await bills.setPaymentCanisterId(pm.canisterId.toText()));
    ok(await recurring.setPropertyCanisterId(p.canisterId));
  });

  afterAll(async () => { await pic?.tearDown(); });

  // ── Ownership transfer ──────────────────────────────────────────────────────

  describe("ownership transfer", () => {
    it("the buyer gets the home and its history; the seller and the seller's delegates lose it everywhere", async () => {
      const seller = await proUser("seller");
      const buyer  = createIdentity(`pa-buyer-${++n}`);   // Free: the handoff year makes them Pro
      const mgr    = createIdentity(`pa-sellers-mgr-${++n}`);
      const viewer = createIdentity(`pa-sellers-viewer-${++n}`);
      const prop   = await register(seller);
      as(property, admin);
      ok(await property.verifyProperty(prop, { Basic: null }, ["utility_bill"]));

      const sellersJob = ok<any>(await createJob(seller, prop));
      ok(await addBill(seller, prop));
      const svc = ok<any>(await createService(seller, prop));

      // The seller's manager (claimed) and a viewer invite still pending.
      as(property, seller);
      const mgrInvite = ok<any>(await property.inviteManager(prop, { Manager: null }, "Pat", []));
      const viewerInvite = ok<any>(await property.inviteManager(prop, { Viewer: null }, "Sam", []));
      ok(await as(property, mgr).claimManagerRole(mgrInvite.token));
      expect(await role(prop, mgr)).toBe("Manager");

      const pending = ok<any>(await as(property, seller).initiateTransfer(prop));
      // The claim token is only readable by the seller.
      expect(await as(property, buyer).getPendingTransfer(prop)).toEqual([]);
      expect(errOf(await as(property, seller).claimTransfer(pending.token))).toBe("InvalidInput");

      const claimed = ok<any>(await as(property, buyer).claimTransfer(pending.token));
      expect(claimed.owner.toText()).toBe(buyer.getPrincipal().toText());
      // The link is single-use.
      expect(errOf(await as(property, createIdentity(`pa-late-${++n}`)).claimTransfer(pending.token))).toBe("NotFound");

      const history = await property.getOwnershipHistory(prop);
      expect(history.map((h: any) => [h.from.toText(), h.to.toText()]))
        .toEqual([[seller.getPrincipal().toText(), buyer.getPrincipal().toText()]]);

      // Seller and delegates: no role, no reads, no writes, on any canister.
      for (const who of [seller, mgr]) {
        expect(await reach(who, prop)).toEqual({
          role: "NoAccess", readsJobs: false, readsSched: false,
          writesJob: "NotAuthorized", writesBill: "NotAuthorized",
        });
      }
      expect(errOf(await as(recurring, seller).addVisitLog(svc.id, "2026-10-01", []))).toBe("NotAuthorized");
      expect(errOf(await as(property, seller).initiateTransfer(prop))).toBe("NotAuthorized");
      // The pending viewer invite died with the sale.
      expect(errOf(await as(property, viewer).claimManagerRole(viewerInvite.token))).toBe("NotFound");

      // The buyer: owner, sees the seller's job history, can add records.
      // A verified home also gives the buyer a year of Pro.
      expect(await as(pay, buyer).getMyHandoffGrant()).toHaveLength(1);
      const jobs = ok<any[]>(await as(job, buyer).getJobsForProperty(prop));
      expect(jobs.map((x: any) => x.id)).toContain(sellersJob.id);
      expect(await reach(buyer, prop)).toMatchObject({ role: "Owner", readsJobs: true, readsSched: true, writesJob: "ok", writesBill: "ok" });
    });

    it("a cancelled, replaced or expired link can't be claimed", async () => {
      const seller = await proUser("seller2");
      const buyer  = createIdentity(`pa-buyer2-${++n}`);
      const prop   = await register(seller);

      // Cancel: only the seller (or an admin).
      const first = ok<any>(await as(property, seller).initiateTransfer(prop));
      expect(errOf(await as(property, buyer).cancelTransfer(prop))).toBe("NotAuthorized");
      ok(await as(property, seller).cancelTransfer(prop));
      expect(errOf(await as(property, buyer).claimTransfer(first.token))).toBe("NotFound");

      // Replace: a new link voids the old one.
      const second = ok<any>(await as(property, seller).initiateTransfer(prop));
      const third  = ok<any>(await as(property, seller).initiateTransfer(prop));
      expect(third.token).not.toBe(second.token);
      expect(errOf(await as(property, buyer).claimTransfer(second.token))).toBe("NotFound");

      // Expire: links last 90 days.
      await pic.advanceTime(91 * DAY_MS);
      await pic.tick();
      expect(errOf(await as(property, buyer).claimTransfer(third.token))).toBe("InvalidInput");
      expect(errOf(await as(property, buyer).claimTransfer(third.token))).toBe("NotFound");
      expect(await role(prop, seller)).toBe("Owner");
    });

    it("two buyers claiming one link in the same round: exactly one gets the home", async () => {
      const seller = await proUser("seller3");
      const prop   = await register(seller);
      const { token } = ok<any>(await as(property, seller).initiateTransfer(prop));
      const buyers = [0, 1, 2].map((i) => createIdentity(`pa-race-buyer-${i}-${++n}`));
      const results = await sameRound(pic, propertyTestIdl as any, propertyCid,
        buyers.map((b) => ({ as: b, method: "claimTransfer", args: [token] })));
      expect(results.filter((r: any) => "ok" in r)).toHaveLength(1);
      const winner = buyers[results.findIndex((r: any) => "ok" in r)];
      expect(await role(prop, winner)).toBe("Owner");
      expect(await property.getOwnershipHistory(prop)).toHaveLength(1);
    });
  });

  // ── Managers ────────────────────────────────────────────────────────────────

  describe("managers", () => {
    it("inviting is Pro-only and owner-only", async () => {
      const freeOwner = createIdentity(`pa-free-${++n}`);
      property.setIdentity(freeOwner);
      const prop = ok<any>(await property.registerProperty({
        address: `${++n} Free St`, city: "Orlando", state: "FL", zipCode: "32801",
        propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
      })).id;
      expect(errOf(await property.inviteManager(prop, { Viewer: null }, "Sam", []))).toBe("InvalidInput");

      const owner = await proUser("owner-invite");
      const other = await proUser("other-invite");
      const mine = await register(owner);
      expect(errOf(await as(property, other).inviteManager(mine, { Viewer: null }, "Sam", []))).toBe("NotAuthorized");
      expect(errOf(await as(property, owner).inviteManager(mine, { Viewer: null }, "", []))).toBe("InvalidInput");
      // The owner can't claim their own invite.
      const inv = ok<any>(await as(property, owner).inviteManager(mine, { Viewer: null }, "Sam", []));
      expect(errOf(await as(property, owner).claimManagerRole(inv.token))).toBe("InvalidInput");
    });

    it("Viewer reads, Manager writes, and only the owner changes roles", async () => {
      const owner  = await proUser("owner-roles");
      const viewer = createIdentity(`pa-viewer-${++n}`);
      const mgr    = await proUser("mgr");   // Pro, so the tier gate isn't what refuses an invite
      const prop   = await register(owner);
      ok(await createJob(owner, prop));
      ok(await createService(owner, prop));

      as(property, owner);
      const vInv = ok<any>(await property.inviteManager(prop, { Viewer: null }, "Sam", []));
      const mInv = ok<any>(await property.inviteManager(prop, { Manager: null }, "Pat", []));
      ok(await as(property, viewer).claimManagerRole(vInv.token));
      ok(await as(property, mgr).claimManagerRole(mInv.token));
      // A claimed invite is used up.
      expect(errOf(await as(property, createIdentity(`pa-x-${++n}`)).claimManagerRole(vInv.token))).toBe("NotFound");

      expect(await reach(viewer, prop)).toEqual({
        role: "Viewer", readsJobs: true, readsSched: true, writesJob: "NotAuthorized", writesBill: "NotAuthorized",
      });
      expect(await reach(mgr, prop)).toMatchObject({ role: "Manager", readsJobs: true, readsSched: true, writesJob: "ok" });

      // Owner-only operations, refused for a Manager.
      as(property, mgr);
      expect(errOf(await property.inviteManager(prop, { Viewer: null }, "Eve", []))).toBe("NotAuthorized");
      expect(errOf(await property.updateManagerRole(prop, viewer.getPrincipal(), { Manager: null }, []))).toBe("NotAuthorized");
      expect(errOf(await property.removeManager(prop, viewer.getPrincipal()))).toBe("NotAuthorized");
      expect(errOf(await property.initiateTransfer(prop))).toBe("NotAuthorized");
      expect(errOf(await property.getPropertyManagers(prop))).toBe("NotAuthorized");

      // Owner promotes the viewer: writes go through at once on job.
      ok(await as(property, owner).updateManagerRole(prop, viewer.getPrincipal(), { Manager: null }, []));
      expect(errOf(await createJob(viewer, prop))).toBe("ok");
      expect(errOf(await as(property, owner).updateManagerRole(prop, createIdentity(`pa-nobody-${++n}`).getPrincipal(), { Viewer: null }, [])))
        .toBe("NotFound");

      // Removed and resigned managers lose access everywhere.
      ok(await as(property, owner).removeManager(prop, mgr.getPrincipal()));
      ok(await as(property, viewer).resignAsManager(prop));
      expect(errOf(await as(property, viewer).resignAsManager(prop))).toBe("NotFound");
      for (const who of [mgr, viewer]) {
        expect(await reach(who, prop)).toEqual({
          role: "NoAccess", readsJobs: false, readsSched: false, writesJob: "NotAuthorized", writesBill: "NotAuthorized",
        });
      }
      expect(ok<any[]>(await as(property, owner).getPropertyManagers(prop))).toEqual([]);
    });

    it("cancelled and expired invites can't be claimed", async () => {
      const owner = await proUser("owner-inv");
      const who   = createIdentity(`pa-invitee-${++n}`);
      const prop  = await register(owner);
      as(property, owner);
      const a = ok<any>(await property.inviteManager(prop, { Viewer: null }, "Sam", []));
      expect(errOf(await as(property, who).cancelManagerInvite(prop, a.token))).toBe("NotAuthorized");
      ok(await as(property, owner).cancelManagerInvite(prop, a.token));
      expect(errOf(await as(property, who).claimManagerRole(a.token))).toBe("NotFound");

      // A second invite for the same role replaces the first.
      const b = ok<any>(await as(property, owner).inviteManager(prop, { Viewer: null }, "Sam", []));
      const c = ok<any>(await as(property, owner).inviteManager(prop, { Viewer: null }, "Sam", []));
      expect(errOf(await as(property, who).claimManagerRole(b.token))).toBe("NotFound");

      await pic.advanceTime(91 * DAY_MS);
      await pic.tick();
      expect(errOf(await as(property, who).claimManagerRole(c.token))).toBe("InvalidInput");
      expect(await role(prop, who)).toBe("NoAccess");
    });

    it("manager activity notifies the owner; only the owner reads or clears it", async () => {
      const owner = await proUser("owner-notif");
      const mgr   = createIdentity(`pa-mgr-n-${++n}`);
      const stranger = createIdentity(`pa-stranger-${++n}`);
      const prop  = await register(owner);
      const inv = ok<any>(await as(property, owner).inviteManager(prop, { Manager: null }, "Pat", []));
      ok(await as(property, mgr).claimManagerRole(inv.token));

      expect(errOf(await as(property, stranger).recordManagerActivity(prop, "Booked a plumber"))).toBe("NotAuthorized");
      ok(await as(property, mgr).recordManagerActivity(prop, "Booked a plumber"));
      expect(errOf(await as(property, mgr).getOwnerNotifications(prop))).toBe("NotAuthorized");
      expect(errOf(await as(property, mgr).dismissNotifications(prop))).toBe("NotAuthorized");
      const notifs = ok<any[]>(await as(property, owner).getOwnerNotifications(prop));
      expect(notifs.map((x: any) => x.description)).toContain("Booked a plumber");
      ok(await as(property, owner).dismissNotifications(prop));
      expect(ok<any[]>(await as(property, owner).getOwnerNotifications(prop))).toEqual([]);
    });
  });

  // ── Approval requests ─────────────────────────────────────────────────────────

  describe("approval requests", () => {
    it("delegates ask, only the owner sees and answers", async () => {
      const owner = await proUser("owner-appr");
      const mgr   = createIdentity(`pa-mgr-a-${++n}`);
      const stranger = createIdentity(`pa-stranger-a-${++n}`);
      const prop  = await register(owner);
      const inv = ok<any>(await as(property, owner).inviteManager(prop, { Manager: null }, "Pat", [500_00n]));
      ok(await as(property, mgr).claimManagerRole(inv.token));

      expect(errOf(await as(property, stranger).requestApproval(prop, "New roof", 1_200_000n))).toBe("NotAuthorized");
      const id = ok<bigint>(await as(property, mgr).requestApproval(prop, "New roof", 1_200_000n));

      expect(errOf(await as(property, mgr).getApprovals(prop))).toBe("NotAuthorized");
      expect(errOf(await as(property, mgr).respondToApproval(prop, id, true))).toBe("NotAuthorized");
      expect(errOf(await as(property, stranger).respondToApproval(prop, id, true))).toBe("NotAuthorized");
      expect(errOf(await as(property, owner).respondToApproval(prop, id + 1000n, true))).toBe("NotFound");

      ok(await as(property, owner).respondToApproval(prop, id, true));
      const list = ok<any[]>(await as(property, owner).getApprovals(prop));
      expect(list.find((a: any) => a.id === id)?.status).toEqual({ Approved: null });
      expect(list.find((a: any) => a.id === id)?.requesterName).toBe("Pat");
    });
  });
});
