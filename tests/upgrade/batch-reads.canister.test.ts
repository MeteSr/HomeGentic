/**
 * The dashboard's batch reads, wired to a real property canister:
 * property.getAccessRoles, job.getJobsForProperties,
 * bills.getBillsForProperties and recurring.getScheduleForProperties.
 *
 * Each returns, in one call, what the per-property reads return for each id,
 * and nothing from properties the caller has no role on.
 *
 * Run: cd tests/upgrade && npx vitest run batch-reads.canister.test.ts
 * (needs .dfx/local/canisters/{property,job,bills,recurring,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
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

const bootstrap = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin:          I.Func([I.Principal, I.Text], [unitResult(I)], []),
});

describe("batch reads for the dashboard", () => {
  let pic: PocketIc;
  let property: any, job: any, bills: any, recurring: any;
  let aliceProp = "", bobProp = "";
  let recurringId: any;
  const recurringTestIdl = withMethods(recurringIdl, (I) => ({
    ...bootstrap(I),
    setPropertyCanisterId: I.Func([I.Principal], [unitResult(I)], []),
  }));

  const admin   = createIdentity("br-admin");
  const alice   = createIdentity("br-alice");
  const bob     = createIdentity("br-bob");
  const mallory = createIdentity("br-mallory");

  async function bootstrapAdmin(actor: any) {
    await actor.setBootstrapNonce("n");   // as the controller
    actor.setIdentity(admin);
    ok(await actor.addAdmin(admin.getPrincipal(), "n"));
  }

  const register = (owner: any, address: string) => {
    property.setIdentity(owner);
    return property.registerProperty({
      address, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    }).then((r: any) => ok<any>(r).id as string);
  };

  beforeAll(async () => {
    pic = await createPic();
    const p = await pic.setupCanister({ idlFactory: withMethods(propertyIdl, bootstrap) as any, wasm: wasmPath("property") });
    const j = await pic.setupCanister({ idlFactory: withMethods(jobIdl, bootstrap) as any, wasm: wasmPath("job") });
    const b = await pic.setupCanister({
      idlFactory: withMethods(billsIdl, (I) => ({
        ...bootstrap(I),
        setPropertyCanisterId: I.Func([I.Text], [unitResult(I)], []),
        setPaymentCanisterId:  I.Func([I.Text], [unitResult(I)], []),
      })) as any,
      wasm: wasmPath("bills"),
    });
    const r = await pic.setupCanister({ idlFactory: recurringTestIdl as any, wasm: wasmPath("recurring") });
    recurringId = r.canisterId;
    const pay = await pic.setupCanister({ idlFactory: paymentIdlFactory as any, wasm: wasmPath("payment") });
    property = p.actor; job = j.actor; bills = b.actor; recurring = r.actor;

    for (const a of [property, job, bills, recurring]) await bootstrapAdmin(a);
    await pay.actor.setBootstrapNonce("n");
    pay.actor.setIdentity(admin);
    ok(await pay.actor.initAdmins([admin.getPrincipal()], "n"));
    ok(await pay.actor.grantSubscription(alice.getPrincipal(), { Pro: null }));   // bill uploads need Pro
    ok(await pay.actor.grantSubscription(bob.getPrincipal(), { Pro: null }));

    ok(await job.setPropertyCanisterId(p.canisterId.toText()));
    ok(await bills.setPropertyCanisterId(p.canisterId.toText()));
    ok(await bills.setPaymentCanisterId(pay.canisterId.toText()));
    ok(await recurring.setPropertyCanisterId(p.canisterId));

    aliceProp = await register(alice, "1 Alice Way");
    bobProp   = await register(bob, "2 Bob Road");

    for (const [who, prop] of [[alice, aliceProp], [bob, bobProp]] as const) {
      job.setIdentity(who);
      ok(await job.createJob(prop, "Water heater", { Plumbing: null }, "Replaced it.", [], 0n, 0n, [], [], true, []));
      bills.setIdentity(who);
      ok(await bills.addBill({
        propertyId: prop, billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
        periodEnd: "2026-09-30", amountCents: 12_000n, usageAmount: [], usageUnit: [],
      }));
      recurring.setIdentity(who);
      const svc = ok<any>(await recurring.createRecurringService(prop, { LawnCare: null }, "Green Co", [], [], { Monthly: null }, "2026-01-01", [], []));
      ok(await recurring.addVisitLog(svc.id, "2026-09-15", []));
      ok(await recurring.addVisitLog(svc.id, "2026-10-15", []));
    }
  });

  afterAll(async () => { await pic?.tearDown(); });

  it("property.getAccessRoles answers per id, in order", async () => {
    const roles = await property.getAccessRoles([aliceProp, "no-such-property", bobProp], alice.getPrincipal());
    expect(roles).toEqual([[{ Owner: null }], [], [{ NoAccess: null }]]);
  });

  it("job.getJobsForProperties returns only the caller's properties' jobs", async () => {
    job.setIdentity(alice);
    const mine = await job.getJobsForProperties([aliceProp, bobProp]);
    expect(mine.map((j: any) => j.propertyId)).toEqual([aliceProp]);
    expect(mine).toEqual(ok<any[]>(await job.getJobsForProperty(aliceProp)));
    job.setIdentity(mallory);
    expect(await job.getJobsForProperties([aliceProp, bobProp])).toEqual([]);
  });

  it("bills.getBillsForProperties returns only the caller's properties' bills", async () => {
    bills.setIdentity(alice);
    const mine = await bills.getBillsForProperties([aliceProp, bobProp]);
    expect(mine.map((b: any) => b.propertyId)).toEqual([aliceProp]);
    bills.setIdentity(mallory);
    expect(await bills.getBillsForProperties([aliceProp, bobProp])).toEqual([]);
  });

  it("recurring.getScheduleForProperties returns services and visits, newest first", async () => {
    recurring.setIdentity(alice);
    const { services, visits } = await recurring.getScheduleForProperties([aliceProp, bobProp]);
    expect(services.map((s: any) => s.propertyId)).toEqual([aliceProp]);
    expect(visits.map((v: any) => v.visitDate)).toEqual(["2026-10-15", "2026-09-15"]);
    expect(visits.every((v: any) => v.serviceId === services[0].id)).toBe(true);
    recurring.setIdentity(mallory);
    expect(await recurring.getScheduleForProperties([aliceProp, bobProp])).toEqual({ services: [], visits: [] });
  });

  // Ids used to be the current millisecond, which every message in a round
  // shares, so the second service replaced the first.
  it("recurring: services and visits created in the same round keep distinct ids", async () => {
    recurring.setIdentity(alice);
    const before = (await recurring.getScheduleForProperties([aliceProp])).services.length;
    const created = await sameRound(pic, recurringTestIdl as any, recurringId, [0, 1, 2].map(() => ({
      as: alice, method: "createRecurringService",
      args: [aliceProp, { PestControl: null }, "Bug Co", [], [], { Quarterly: null }, "2026-01-01", [], []],
    })));
    const ids = created.map((r: any) => ok<any>(r).id);
    expect(new Set(ids).size).toBe(3);
    const visits = await sameRound(pic, recurringTestIdl as any, recurringId,
      [0, 1].map(() => ({ as: alice, method: "addVisitLog", args: [ids[0], "2026-10-20", []] })));
    expect(new Set(visits.map((r: any) => ok<any>(r).id)).size).toBe(2);
    const after = await recurring.getScheduleForProperties([aliceProp]);
    expect(after.services.length).toBe(before + 3);
    expect(after.visits.filter((v: any) => v.serviceId === ids[0])).toHaveLength(2);
  });

  it("an empty list reads nothing", async () => {
    job.setIdentity(alice);
    expect(await job.getJobsForProperties([])).toEqual([]);
  });
});
