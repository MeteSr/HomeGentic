/**
 * Home warranty plan (#719), mortgage details (#722) and the FEMA flood zone
 * (#718) on the property canister, on real property and payment canisters.
 *
 *  HF.1 home warranty plan: write access saves it, the household reads it,
 *       bad input is refused, null clears it
 *  HF.2 home warranty claims: add, edit (outcome, fee, linked job), delete,
 *       newest filed first; bad input refused
 *  HF.3 mortgage details: only the owner and co-owners save or read them;
 *       bad input refused; null clears
 *  HF.4 flood zone: only the Worker (identity relay) looks up the address and
 *       saves the result, and only for a principal with a role on the home;
 *       the household reads it with getFloodZone
 *  HF.5 getPulseHomeFinance gives the notification relay the warranty
 *       renewal and the loan terms the PMI reminder needs, notifiers only
 *  HF.6 everything survives an upgrade
 *  HF.7 on a claimed transfer the plan and loan go (the seller's), the claim
 *       history and flood zone stay with the home; deleteMyData drops the rest
 *
 * Run: cd tests/upgrade && npx vitest run property-home-finance.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

const plan = (over: Record<string, unknown> = {}) => ({
  provider: "American Home Shield",
  planName: "ShieldGold",
  contractNumber: "AHS-123456",
  claimContact: "1-800-555-0100, ahs.com",
  serviceFeeCents: [12_500n],
  startDate: "2026-03-15",
  renewalDate: "2027-03-15",
  coverageNotes: "HVAC, plumbing, electrical, water heater, kitchen appliances",
  exclusionNotes: "Pool equipment; $2,000 cap on HVAC replacement",
  contractDocId: ["doc-ahs-contract"],
  ...over,
});
const claim = (over: Record<string, unknown> = {}) => ({
  dateFiled: "2026-07-02",
  issue: "AC not cooling",
  claimNumber: "WO-77812",
  jobId: [],
  serviceFeePaidCents: [12_500n],
  outcome: { Open: null },
  outcomeNotes: "",
  ...over,
});
const loan = (over: Record<string, unknown> = {}) => ({
  lender: "Sunshine Bank",
  originalAmountCents: 30_000_000n,
  rateThousandthsPct: 6_500n,
  termMonths: 360n,
  firstPaymentDate: "2024-02-01",
  originalValueCents: [35_000_000n],
  currentValueCents: [42_000_000n],
  monthlyPmiCents: [12_000n],
  monthlyEscrowCents: [60_000n],
  statementBalanceCents: [],
  statementDate: "",
  ...over,
});
const flood = (over: Record<string, unknown> = {}) => ({
  status: { Mapped: null },
  zone: "AE",
  zoneSubtype: "",
  specialFloodHazardArea: true,
  baseFloodElevation: "8",
  firmPanel: "12095C0430F",
  firmEffectiveDate: "2009-09-25",
  matchedAddress: "18 PALM CT, ORLANDO, FL, 32801",
  latitude: "28.5383",
  longitude: "-81.3792",
  ...over,
});

describe("home warranty plan, mortgage details and flood zone", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let other = "";
  let acClaim = "";

  const admin = createIdentity("hf-admin");
  const owner = createIdentity("hf-owner");
  const coOwner = createIdentity("hf-coowner");
  const manager = createIdentity("hf-manager");
  const viewer = createIdentity("hf-viewer");
  const stranger = createIdentity("hf-stranger");
  const worker = createIdentity("hf-worker");
  const notifier = createIdentity("hf-notifier");
  const buyer = createIdentity("hf-buyer");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity) => as("property", who);
  const nextMinute = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };
  const register = async (address: string) =>
    ok<any>(
      await prop(owner).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (
        await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
      ).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await prop(admin).setPaymentCanisterId(ids.payment));
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    ok(await prop(admin).addIdentityRelay(worker.getPrincipal()));
    ok(await prop(admin).addNotifier(notifier.getPrincipal()));

    home = await register("18 Palm Ct");
    other = await register("22 Palm Ct");
    for (const [who, role] of [
      [coOwner, "CoOwner"],
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(owner).inviteManager(home, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("HF.1 keeps the home warranty plan the household enters", async () => {
    expect(ok<any>(await prop(owner).getHomeWarrantyPlan(home))).toEqual([]);
    ok(await prop(manager).setHomeWarrantyPlan(home, [plan({ provider: "  American Home Shield " })]));
    const saved = ok<any[]>(await prop(viewer).getHomeWarrantyPlan(home))[0];
    expect(saved).toMatchObject({
      provider: "American Home Shield",
      renewalDate: "2027-03-15",
      serviceFeeCents: [12_500n],
      contractDocId: ["doc-ahs-contract"],
    });
    expect(typeof saved.updatedAt).toBe("bigint");

    expect(errKey(await prop(viewer).setHomeWarrantyPlan(home, [plan()]))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).setHomeWarrantyPlan(home, [plan()]))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getHomeWarrantyPlan(home))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getHomeWarrantyPlan("no-such-home"))).toBe("NotFound");

    const bad = [
      plan({ provider: " " }),
      plan({ provider: "x".repeat(101) }),
      plan({ planName: "x".repeat(101) }),
      plan({ contractNumber: "x".repeat(61) }),
      plan({ claimContact: "x".repeat(201) }),
      plan({ serviceFeeCents: [100_001n] }),
      plan({ startDate: "March 2026" }),
      plan({ renewalDate: "" }),
      plan({ renewalDate: "2027-02-30" }),
      plan({ startDate: "2027-04-01" }), // after the renewal date
      plan({ coverageNotes: "x".repeat(2001) }),
      plan({ exclusionNotes: "x".repeat(2001) }),
      plan({ contractDocId: ["bad id!"] }),
    ];
    for (const p of bad) {
      expect(errKey(await prop(owner).setHomeWarrantyPlan(home, [p]))).toBe("InvalidInput");
    }
    await nextMinute();
    ok(await prop(owner).setHomeWarrantyPlan(other, [plan()]));
    ok(await prop(owner).setHomeWarrantyPlan(other, []));
    expect(ok<any>(await prop(owner).getHomeWarrantyPlan(other))).toEqual([]);
  });

  it("HF.2 logs home warranty claims, linked to jobs", async () => {
    await nextMinute();
    const added = ok<any>(await prop(owner).addHomeWarrantyClaim(home, claim()));
    acClaim = added.id;
    expect(acClaim).toMatch(/^[0-9a-f-]{36}$/);
    expect(added).toMatchObject({ propertyId: home, issue: "AC not cooling", outcome: { Open: null } });

    const closed = ok<any>(
      await prop(manager).updateHomeWarrantyClaim(
        acClaim,
        claim({
          outcome: { PartlyApproved: null },
          outcomeNotes: "Compressor covered, not the duct work",
          jobId: ["job-ac"],
        }),
      ),
    );
    expect(closed).toMatchObject({ outcome: { PartlyApproved: null }, jobId: ["job-ac"] });
    expect(closed.createdAt).toBe(added.createdAt);

    const older = ok<any>(
      await prop(owner).addHomeWarrantyClaim(
        home,
        claim({ dateFiled: "2026-04-10", issue: "Dishwasher leak", outcome: { Denied: null } }),
      ),
    );
    expect(ok<any[]>(await prop(viewer).getHomeWarrantyClaims(home)).map((c) => c.issue)).toEqual([
      "AC not cooling",
      "Dishwasher leak",
    ]);

    const bad = [
      claim({ issue: "" }),
      claim({ issue: "x".repeat(121) }),
      claim({ dateFiled: "07/02/2026" }),
      claim({ claimNumber: "x".repeat(61) }),
      claim({ serviceFeePaidCents: [100_001n] }),
      claim({ outcomeNotes: "x".repeat(1001) }),
      claim({ jobId: ["bad id!"] }),
    ];
    for (const c of bad) {
      expect(errKey(await prop(owner).addHomeWarrantyClaim(home, c))).toBe("InvalidInput");
    }
    await nextMinute();
    expect(errKey(await prop(viewer).addHomeWarrantyClaim(home, claim()))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).updateHomeWarrantyClaim(acClaim, claim()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getHomeWarrantyClaims(home))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).deleteHomeWarrantyClaim(older.id))).toBe("NotAuthorized");
    ok(await prop(owner).deleteHomeWarrantyClaim(older.id));
    expect(errKey(await prop(owner).deleteHomeWarrantyClaim(older.id))).toBe("NotFound");
    expect(errKey(await prop(owner).updateHomeWarrantyClaim("no-such-claim", claim()))).toBe("NotFound");
  });

  it("HF.3 keeps the mortgage details private to the owner and co-owners", async () => {
    await nextMinute();
    expect(ok<any>(await prop(owner).getMortgageLoan(home))).toEqual([]);
    ok(await prop(coOwner).setMortgageLoan(home, [loan()]));
    const saved = ok<any[]>(await prop(owner).getMortgageLoan(home))[0];
    expect(saved).toMatchObject({ lender: "Sunshine Bank", originalAmountCents: 30_000_000n, termMonths: 360n });

    expect(errKey(await prop(manager).getMortgageLoan(home))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).getMortgageLoan(home))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getMortgageLoan(home))).toBe("NotAuthorized");
    expect(errKey(await prop(manager).setMortgageLoan(home, [loan()]))).toBe("NotAuthorized");

    const bad = [
      loan({ lender: "x".repeat(101) }),
      loan({ originalAmountCents: 0n }),
      loan({ originalAmountCents: 10_000_000_001n }),
      loan({ rateThousandthsPct: 30_001n }),
      loan({ termMonths: 11n }),
      loan({ termMonths: 481n }),
      loan({ firstPaymentDate: "2024-02" }),
      loan({ originalValueCents: [0n] }),
      loan({ currentValueCents: [10_000_000_001n] }),
      loan({ monthlyPmiCents: [10_000_001n] }),
      loan({ statementBalanceCents: [27_900_000n], statementDate: "" }), // a balance needs its date
      loan({ statementBalanceCents: [], statementDate: "2025-01-01" }),
      loan({ statementBalanceCents: [30_000_001n], statementDate: "2025-01-01" }), // over the amount borrowed
    ];
    for (const l of bad) {
      expect(errKey(await prop(owner).setMortgageLoan(home, [l]))).toBe("InvalidInput");
    }
    await nextMinute();
    ok(
      await prop(owner).setMortgageLoan(home, [
        loan({ statementBalanceCents: [27_900_000n], statementDate: "2025-01-01" }),
      ]),
    );
    ok(await prop(owner).setMortgageLoan(other, [loan()]));
    ok(await prop(owner).setMortgageLoan(other, []));
    expect(ok<any>(await prop(owner).getMortgageLoan(other))).toEqual([]);
  });

  it("HF.4 saves the FEMA flood zone only through the Worker, for someone on the home", async () => {
    await nextMinute();
    const target = ok<any>(await prop(worker).relayFloodTarget(home, viewer.getPrincipal()));
    expect(target).toMatchObject({
      address: "18 Palm Ct",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
      floodZone: [],
    });
    expect(errKey(await prop(worker).relayFloodTarget(home, stranger.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).relayFloodTarget(home, owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await prop(worker).relayFloodTarget("no-such-home", owner.getPrincipal()))).toBe("NotFound");

    const saved = ok<any>(await prop(worker).relaySetFloodZone(home, viewer.getPrincipal(), flood()));
    expect(saved).toMatchObject({ zone: "AE", specialFloodHazardArea: true, firmEffectiveDate: "2009-09-25" });
    expect(ok<any[]>(await prop(owner).getFloodZone(home))[0].zone).toBe("AE");
    expect(ok<any>(await prop(worker).relayFloodTarget(home, owner.getPrincipal())).floodZone[0].zone).toBe("AE");
    expect(errKey(await prop(stranger).getFloodZone(home))).toBe("NotAuthorized");

    // Only the Worker writes it, and only for someone on the home.
    expect(errKey(await prop(owner).relaySetFloodZone(home, owner.getPrincipal(), flood()))).toBe("NotAuthorized");
    expect(errKey(await prop(worker).relaySetFloodZone(home, stranger.getPrincipal(), flood()))).toBe("NotAuthorized");
    const bad = [
      flood({ zone: "x".repeat(11) }),
      flood({ zoneSubtype: "x".repeat(121) }),
      flood({ baseFloodElevation: "x".repeat(21) }),
      flood({ firmPanel: "x".repeat(21) }),
      flood({ firmEffectiveDate: "1960-01-01" }),
      flood({ matchedAddress: "x".repeat(301) }),
      flood({ latitude: "x".repeat(21) }),
    ];
    for (const f of bad) {
      expect(errKey(await prop(worker).relaySetFloodZone(home, owner.getPrincipal(), f))).toBe("InvalidInput");
    }
    // An area FEMA hasn't mapped is saved as such.
    const unmapped = ok<any>(
      await prop(worker).relaySetFloodZone(
        other,
        owner.getPrincipal(),
        flood({
          status: { NotMapped: null },
          zone: "",
          firmPanel: "",
          firmEffectiveDate: "",
          specialFloodHazardArea: false,
          baseFloodElevation: "",
        }),
      ),
    );
    expect(unmapped.status).toEqual({ NotMapped: null });
  });

  it("HF.5 gives the notification relay the warranty renewal and the loan's terms", async () => {
    const rows = ok<any[]>(await prop(notifier).getPulseHomeFinance(owner.getPrincipal()));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      propertyId: home,
      warranty: [{ provider: "American Home Shield", renewalDate: "2027-03-15" }],
      loan: [
        {
          originalAmountCents: 30_000_000n,
          rateThousandthsPct: 6_500n,
          termMonths: 360n,
          firstPaymentDate: "2024-02-01",
          originalValueCents: [35_000_000n],
          monthlyPmiCents: [12_000n],
        },
      ],
    });
    expect(Object.keys(rows[0].loan[0])).not.toContain("lender");
    expect(ok<any[]>(await prop(admin).getPulseHomeFinance(owner.getPrincipal()))).toHaveLength(1);
    expect(errKey(await prop(owner).getPulseHomeFinance(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await prop(worker).getPulseHomeFinance(owner.getPrincipal()))).toBe("NotAuthorized");
  });

  it("HF.6 keeps everything across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(ok<any[]>(await prop(owner).getHomeWarrantyPlan(home))[0].provider).toBe("American Home Shield");
    expect(ok<any[]>(await prop(owner).getHomeWarrantyClaims(home)).map((c) => c.id)).toEqual([acClaim]);
    expect(ok<any[]>(await prop(owner).getMortgageLoan(home))[0].statementBalanceCents).toEqual([27_900_000n]);
    expect(ok<any[]>(await prop(owner).getFloodZone(home))[0].zone).toBe("AE");
  });

  it("HF.7 drops the seller's plan and loan on a transfer, keeps claims and flood zone; deleteMyData drops the rest", async () => {
    await nextMinute();
    ok(await prop(owner).setHomeWarrantyPlan(other, [plan()]));
    ok(await prop(owner).addHomeWarrantyClaim(other, claim()));
    ok(await prop(owner).setMortgageLoan(other, [loan()]));

    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(ok<any>(await prop(buyer).getHomeWarrantyPlan(home))).toEqual([]);
    expect(ok<any>(await prop(buyer).getMortgageLoan(home))).toEqual([]);
    expect(ok<any[]>(await prop(buyer).getHomeWarrantyClaims(home)).map((c) => c.id)).toEqual([acClaim]);
    expect(ok<any[]>(await prop(buyer).getFloodZone(home))[0].zone).toBe("AE");

    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(owner).getHomeWarrantyPlan(other))).toBe("NotFound");
    expect(ok<any[]>(await prop(notifier).getPulseHomeFinance(owner.getPrincipal()))).toEqual([]);
    // The buyer's home is untouched.
    expect(ok<any[]>(await prop(buyer).getHomeWarrantyClaims(home))).toHaveLength(1);
  });
});
