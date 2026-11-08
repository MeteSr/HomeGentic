/**
 * Property-tax years (#714) on the property canister, on real property and
 * payment canisters.
 *
 *  PT.1 only the owner and co-owners save, read or delete a year (exemption
 *       status is the owner's); one record per tax year, newest first; saving
 *       the same year again replaces it
 *  PT.2 bad input is refused
 *  PT.3 getPulsePropertyTax gives the notification relay each home's two
 *       newest years (status and petition deadline only), notifiers only
 *  PT.4 the years survive an upgrade
 *  PT.5 a claimed transfer drops the seller's years; deleteMyData drops the rest
 *
 * Run: cd tests/upgrade && npx vitest run property-tax.canister.test.ts
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

const taxYear = (over: Record<string, unknown> = {}) => ({
  year: 2026n,
  marketValueCents: [41_250_000n],
  assessedValueCents: [31_800_000n],
  taxableValueCents: [26_800_000n],
  exemption: { Granted: null },
  petitionDeadline: "2026-09-15",
  notes: "TRIM notice mailed Aug 21",
  ...over,
});

describe("property-tax years", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let other = "";

  const admin = createIdentity("pt-admin");
  const owner = createIdentity("pt-owner");
  const coOwner = createIdentity("pt-coowner");
  const manager = createIdentity("pt-manager");
  const viewer = createIdentity("pt-viewer");
  const stranger = createIdentity("pt-stranger");
  const notifier = createIdentity("pt-notifier");
  const buyer = createIdentity("pt-buyer");

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
        city: "DeLand",
        state: "FL",
        zipCode: "32720",
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
    ok(await prop(admin).addNotifier(notifier.getPrincipal()));

    home = await register("40 Indiana Ave");
    other = await register("44 Indiana Ave");
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

  it("PT.1 keeps one record per tax year for the owner and co-owners, newest first", async () => {
    expect(ok<any[]>(await prop(owner).getPropertyTaxYears(home))).toEqual([]);
    const saved = ok<any>(await prop(owner).setPropertyTaxYear(home, taxYear()));
    expect(saved).toMatchObject({ year: 2026n, assessedValueCents: [31_800_000n], exemption: { Granted: null } });
    ok(
      await prop(coOwner).setPropertyTaxYear(
        home,
        taxYear({ year: 2025n, petitionDeadline: "", exemption: { Applied: null } }),
      ),
    );
    ok(
      await prop(owner).setPropertyTaxYear(
        home,
        taxYear({ year: 2024n, marketValueCents: [], notes: "", petitionDeadline: "" }),
      ),
    );
    // Saving 2026 again replaces it.
    ok(await prop(owner).setPropertyTaxYear(home, taxYear({ assessedValueCents: [32_000_000n] })));

    const years = ok<any[]>(await prop(coOwner).getPropertyTaxYears(home));
    expect(years.map((y) => y.year)).toEqual([2026n, 2025n, 2024n]);
    expect(years[0].assessedValueCents).toEqual([32_000_000n]);
    expect(years[2].marketValueCents).toEqual([]);

    for (const who of [manager, viewer, stranger]) {
      expect(errKey(await prop(who).getPropertyTaxYears(home))).toBe("NotAuthorized");
      expect(errKey(await prop(who).setPropertyTaxYear(home, taxYear()))).toBe("NotAuthorized");
      expect(errKey(await prop(who).deletePropertyTaxYear(home, 2024n))).toBe("NotAuthorized");
    }
    await nextMinute();
    ok(await prop(owner).deletePropertyTaxYear(home, 2024n));
    expect(errKey(await prop(owner).deletePropertyTaxYear(home, 2024n))).toBe("NotFound");
    expect(errKey(await prop(owner).getPropertyTaxYears("no-such-home"))).toBe("NotFound");
    expect(ok<any[]>(await prop(owner).getPropertyTaxYears(home)).map((y) => y.year)).toEqual([2026n, 2025n]);
  });

  it("PT.2 refuses bad input", async () => {
    await nextMinute();
    const bad = [
      taxYear({ year: 1949n }),
      taxYear({ year: 2101n }),
      taxYear({ marketValueCents: [100_000_000_001n] }),
      taxYear({ assessedValueCents: [100_000_000_001n] }),
      taxYear({ taxableValueCents: [100_000_000_001n] }),
      taxYear({ petitionDeadline: "2026-09" }),
      taxYear({ petitionDeadline: "2026-02-30" }),
      taxYear({ petitionDeadline: "2028-09-15" }), // not in the tax year it's for
      taxYear({ notes: "x".repeat(1001) }),
    ];
    for (const y of bad) {
      expect(errKey(await prop(owner).setPropertyTaxYear(home, y))).toBe("InvalidInput");
    }
    expect(errKey(await prop(owner).setPropertyTaxYear("no-such-home", taxYear()))).toBe("NotFound");
  });

  it("PT.3 gives the notification relay each home's two newest years, status only", async () => {
    await nextMinute();
    ok(await prop(owner).setPropertyTaxYear(home, taxYear({ year: 2023n, petitionDeadline: "2023-09-12" })));
    const rows = ok<any[]>(await prop(notifier).getPulsePropertyTax(owner.getPrincipal()));
    expect(rows).toEqual([
      {
        propertyId: home,
        years: [
          { year: 2026n, exemption: { Granted: null }, petitionDeadline: "2026-09-15" },
          { year: 2025n, exemption: { Applied: null }, petitionDeadline: "" },
        ],
      },
    ]);
    expect(ok<any[]>(await prop(admin).getPulsePropertyTax(owner.getPrincipal()))).toHaveLength(1);
    expect(errKey(await prop(owner).getPulsePropertyTax(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getPulsePropertyTax(owner.getPrincipal()))).toBe("NotAuthorized");
  });

  it("PT.4 keeps the years across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(ok<any[]>(await prop(owner).getPropertyTaxYears(home)).map((y) => y.year)).toEqual([2026n, 2025n, 2023n]);
  });

  it("PT.5 drops the seller's years on a transfer; deleteMyData drops the rest", async () => {
    await nextMinute();
    ok(await prop(owner).setPropertyTaxYear(other, taxYear()));
    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(ok<any[]>(await prop(buyer).getPropertyTaxYears(home))).toEqual([]);

    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(owner).getPropertyTaxYears(other))).toBe("NotFound");
    expect(ok<any[]>(await prop(notifier).getPulsePropertyTax(owner.getPrincipal()))).toEqual([]);
  });
});
