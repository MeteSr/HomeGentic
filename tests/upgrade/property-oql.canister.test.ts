/**
 * OQL on the property canister (docs/AI_CONNECTORS.md, audits/icp-aiware-2026-11-10.md):
 * `schema()` and `execute(oql)` let an AI assistant (ICP MCP, or the in-app
 * assistant's query_home_records tool) read the household's own records about
 * each home (insurance, contents, warranty, mortgage, tax, HOA, flood zone,
 * rooms and fixtures, move-in plan) in one call, without a method per
 * question. Real property and payment canisters.
 *
 *  POQL.1 schema() is a query listing every entity; no principals, and no
 *         house guide (it holds Wi-Fi passwords and alarm codes)
 *  POQL.2 execute is a plain query (the access check is local)
 *  POQL.3 the owner reads their homes' records with no property filter, and
 *         can filter and add up
 *  POQL.4 strangers and anonymous callers get nothing, even when they name the
 *         home; a manager reads the home they name, but not its mortgage or
 *         tax records (owner and co-owners only, as the getters decide)
 *  POQL.5 malformed, oversized and too-many-homes queries are rejected with a
 *         message and change nothing
 *
 * Run: cd tests/upgrade && npx vitest run property-oql.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
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

type Cell = { name: string; value: Record<string, unknown> };
type Result = { hasMore: boolean; rows: Cell[][] };
const plain = (row: Cell[]) =>
  Object.fromEntries(
    row.map((c) => {
      const [k, v] = Object.entries(c.value)[0];
      return [c.name, k === "null" ? null : typeof v === "bigint" ? Number(v) : v];
    }),
  );

const CANISTERS = ["property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

const ENTITIES = [
  "homes",
  "rooms",
  "fixtures",
  "insurance_policies",
  "insurance_claims",
  "inventory_items",
  "warranty_plans",
  "warranty_claims",
  "mortgages",
  "tax_years",
  "hoa_assessments",
  "hoa_reviews",
  "flood_zones",
  "move_in_tasks",
];

describe("property OQL (schema + execute)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let homeA = "";
  let homeB = "";
  let otherHome = "";

  const admin = createIdentity("poql-admin");
  const owner = createIdentity("poql-owner");
  const manager = createIdentity("poql-manager");
  const stranger = createIdentity("poql-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity) => as("property", who);
  const exec = async (who: Identity, q: object | string): Promise<Result> =>
    prop(who).execute(typeof q === "string" ? q : JSON.stringify(q));
  const rows = async (who: Identity, q: object) => (await exec(who, q)).rows.map(plain);
  const pin = (id: string) => ({ eq: { field: "propertyId", value: id } });

  const register = async (who: Identity, address: string, yearBuilt: bigint) =>
    ok<any>(
      await prop(who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt,
        squareFeet: 1600n,
        tier: { Pro: null },
      }),
    ).id as string;
  const policy = (carrier: string) => ({
    carrier,
    policyNumber: "HO3-123",
    renewalDate: "2026-06-01",
    coverageACents: [35_000_000n],
    hurricaneDeductible: [{ PercentOfCoverageA: 2n }],
  });

  beforeAll(async () => {
    pic = await createPic();
    await pic.setTime(Date.now());
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
    for (const who of [owner, stranger])
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));

    homeA = await register(owner, "1 Record Way", 1985n);
    homeB = await register(owner, "2 Record Way", 2004n);
    otherHome = await register(stranger, "3 Elsewhere Rd", 1990n);

    const invite = ok<any>(await prop(owner).inviteManager(homeA, { Manager: null }, "Manager", []));
    ok(await prop(manager).claimManagerRole(invite.token));

    ok(await prop(owner).setInsurancePolicy(homeA, [policy("Citizens")]));
    ok(await prop(stranger).setInsurancePolicy(otherHome, [policy("Their Carrier")]));
    ok(
      await prop(owner).createInsuranceClaim(homeA, {
        title: "Hurricane roof damage",
        dateOfLoss: "2024-10-10",
        cause: "Wind",
        description: "Shingles off",
        claimNumber: "CL-1",
        adjusterName: "",
        adjusterContact: "",
        status: { Open: null },
      }),
    );
    for (const [name, cents] of [
      ["TV", 120_000n],
      ["Sofa", 80_000n],
    ] as const)
      ok(
        await prop(owner).addInventoryItem(homeA, {
          roomId: [],
          name,
          category: "Furniture",
          quantity: 1n,
          valueCents: [cents],
          purchaseDate: "",
          serialNumber: "",
          notes: "",
        }),
      );
    ok(
      await prop(owner).setMortgageLoan(homeA, [
        {
          lender: "Big Bank",
          originalAmountCents: 30_000_000n,
          rateThousandthsPct: 6_250n,
          termMonths: 360n,
          firstPaymentDate: "2020-01-01",
          originalValueCents: [],
          currentValueCents: [],
          monthlyPmiCents: [],
          monthlyEscrowCents: [],
          statementBalanceCents: [],
          statementDate: "",
        },
      ]),
    );
    ok(
      await prop(owner).setPropertyTaxYear(homeA, {
        year: 2025n,
        marketValueCents: [40_000_000n],
        assessedValueCents: [],
        taxableValueCents: [],
        exemption: { Granted: null },
        petitionDeadline: "",
        notes: "",
      }),
    );
    const room = ok<any>(
      await prop(owner).createRoom({
        propertyId: homeA,
        name: "Kitchen",
        floorName: "First Floor",
        floorType: "Tile",
        paintColor: "",
        paintBrand: "",
        paintCode: "",
        notes: "",
      }),
    );
    ok(
      await prop(owner).addFixture(room.id, {
        brand: "Bosch",
        model: "SHX",
        serialNumber: "",
        installedDate: "2021-04-01",
        warrantyExpiry: "2026-04-01",
        notes: "",
      }),
    );
    ok(await prop(owner).startMoveInPlan(homeB));
    ok(
      await prop(owner).addMoveInTasks(homeB, [
        { title: "Replace smoke detectors", detail: "", area: "Safety", urgency: { Safety: null } },
      ]),
    );
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("POQL.1 schema() lists every entity, with no principals and no house guide", async () => {
    expect(svcs.property._fields.find(([n]) => n === "schema")?.[1].annotations).toEqual(["query"]);
    const schema = JSON.parse(await prop(stranger).schema());
    expect(schema.entities.map((e: any) => e.name)).toEqual(ENTITIES);
    for (const e of schema.entities) {
      const names = e.fields.map((f: any) => f.name);
      if (e.name !== "homes") expect(names).toContain("propertyId");
      for (const banned of ["owner", "homeowner", "principal", "nameOnId", "identitySessionId", "wifiPassword"])
        expect(names).not.toContain(banned);
      for (const f of e.fields) expect(f.role).toBe("payload");
    }
  });

  it("POQL.2 execute is a query", async () => {
    expect(svcs.property._fields.find(([n]) => n === "execute")?.[1].annotations).toEqual(["query"]);
  });

  it("POQL.3 lets the owner read and add up their homes' records", async () => {
    expect(await rows(owner, { start: "homes", select: ["id", "yearBuilt", "myRole"], orderBy: [{ field: "yearBuilt" }] })).toEqual([
      { id: homeA, yearBuilt: 1985, myRole: "Owner" },
      { id: homeB, yearBuilt: 2004, myRole: "Owner" },
    ]);
    expect(
      await rows(owner, {
        start: "insurance_policies",
        select: ["propertyId", "carrier", "renewalDate", "coverageACents", "hurricaneDeductiblePercent"],
      }),
    ).toEqual([
      { propertyId: homeA, carrier: "Citizens", renewalDate: "2026-06-01", coverageACents: 35_000_000, hurricaneDeductiblePercent: 2 },
    ]);
    expect(await rows(owner, { start: "insurance_claims", select: ["title", "status"] })).toEqual([
      { title: "Hurricane roof damage", status: "Open" },
    ]);
    expect(
      await rows(owner, { start: "inventory_items", aggregate: [{ fn: "sum", field: "valueCents", as: "total" }] }),
    ).toEqual([{ total: 200_000 }]);
    expect(await rows(owner, { start: "mortgages", select: ["lender", "ratePercent", "termMonths"] })).toEqual([
      { lender: "Big Bank", ratePercent: 6.25, termMonths: 360 },
    ]);
    expect(await rows(owner, { start: "tax_years", select: ["year", "exemption"] })).toEqual([
      { year: 2025, exemption: "Granted" },
    ]);
    expect(await rows(owner, { start: "fixtures", select: ["roomName", "brand", "warrantyExpiry"] })).toEqual([
      { roomName: "Kitchen", brand: "Bosch", warrantyExpiry: "2026-04-01" },
    ]);
    expect(await rows(owner, { start: "move_in_tasks", select: ["propertyId", "title", "urgency", "done"] })).toEqual([
      { propertyId: homeB, title: "Replace smoke detectors", urgency: "Safety", done: false },
    ]);
  });

  it("POQL.4 shows strangers and anonymous callers nothing; a manager reads the named home without mortgage or tax", async () => {
    expect(await rows(stranger, { start: "insurance_policies", where: pin(homeA) })).toEqual([]);
    expect(
      (
        await rows(stranger, {
          start: "insurance_policies",
          where: { in: { field: "propertyId", value: [homeA, homeB, otherHome] } },
          select: ["carrier"],
        })
      ),
    ).toEqual([{ carrier: "Their Carrier" }]);
    expect(await exec(new AnonymousIdentity(), { start: "homes" })).toEqual({ hasMore: false, rows: [] });

    expect(await rows(manager, { start: "insurance_policies" })).toEqual([]);
    expect(await rows(manager, { start: "insurance_policies", where: pin(homeA), select: ["carrier"] })).toEqual([
      { carrier: "Citizens" },
    ]);
    expect(await rows(manager, { start: "homes", where: { eq: { field: "id", value: homeA } }, select: ["myRole"] })).toEqual([
      { myRole: "Manager" },
    ]);
    expect(await rows(manager, { start: "mortgages", where: pin(homeA) })).toEqual([]);
    expect(await rows(manager, { start: "tax_years", where: pin(homeA) })).toEqual([]);
    expect(await rows(manager, { start: "inventory_items", where: pin(homeB) })).toEqual([]);
  });

  it("POQL.5 rejects malformed, oversized and too-many-homes queries with a message", async () => {
    await expect(exec(owner, "not json")).rejects.toThrow(/OQL/);
    await expect(exec(owner, { start: "house_guides" })).rejects.toThrow(/OQL.*house_guides/);
    await expect(exec(owner, { start: "homes", select: ["owner"] })).rejects.toThrow(/OQL/);
    await expect(exec(owner, "x".repeat(5000))).rejects.toThrow(/OQL/);
    const many = Array.from({ length: 21 }, (_, i) => `HOME_${i}`);
    await expect(
      exec(owner, { start: "insurance_policies", where: { in: { field: "propertyId", value: many } } }),
    ).rejects.toThrow(/OQL.*20 homes/);
    expect((await rows(owner, { start: "homes", aggregate: [{ fn: "count", as: "n" }] }))[0].n).toBe(2);
  });
});
