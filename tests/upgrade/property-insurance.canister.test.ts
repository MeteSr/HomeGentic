/**
 * Insurance policy tracker (issue #711): the household keeps the home's
 * insurance policy on record (property canister, setInsurancePolicy /
 * getInsurancePolicy) and the notification relay reads renewal dates for the
 * weekly Home Pulse email (getPulseInsurance), on real property and payment
 * canisters wired as deploy.sh wires them.
 *
 *  IP.1 owner and managers with write access can save a policy; viewers and
 *       strangers can't
 *  IP.2 the household reads the policy; a stranger is NotAuthorized and an
 *       unknown home NotFound
 *  IP.3 bad input is refused: empty carrier, malformed or impossible renewal
 *       dates, out-of-range deductible percent, oversized text
 *  IP.4 null clears the policy
 *  IP.5 getPulseInsurance is for notifiers and admins only, and lists only the
 *       owner's homes that have a policy
 *  IP.6 the policy survives an upgrade (new stable side map, not a Property field)
 *  IP.7 a claimed transfer drops the seller's policy; deleteMyData drops the
 *       owner's policies
 *
 * Run: cd tests/upgrade && npx vitest run property-insurance.canister.test.ts
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

const POLICY = {
  carrier: "Citizens Property Insurance",
  policyNumber: "FL-HO3-0042",
  renewalDate: "2027-06-01",
  coverageACents: [35_000_000n],
  hurricaneDeductible: [{ PercentOfCoverageA: 2n }],
};

describe("insurance policy tracker", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let secondHome = "";

  const admin = createIdentity("ip-admin");
  const owner = createIdentity("ip-owner");
  const manager = createIdentity("ip-manager");
  const viewer = createIdentity("ip-viewer");
  const stranger = createIdentity("ip-stranger");
  const notifier = createIdentity("ip-notifier");
  const buyer = createIdentity("ip-buyer");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const policyOf = async (who: Identity, id = home) => as("property", who).getInsurancePolicy(id);
  const register = async (address: string) =>
    ok<any>(
      await as("property", owner).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2004n,
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
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("property", admin).addNotifier(notifier.getPrincipal()));
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));

    home = await register("12 Policy Way");
    secondHome = await register("14 Policy Way");
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await as("property", owner).inviteManager(home, { [role]: null }, role, []));
      ok(await as("property", who).claimManagerRole(invite.token));
    }
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("IP.1 lets the owner and managers save a policy, not viewers or strangers", async () => {
    ok(await as("property", owner).setInsurancePolicy(home, [POLICY]));
    ok(
      await as("property", manager).setInsurancePolicy(home, [
        { ...POLICY, policyNumber: "FL-HO3-0043", hurricaneDeductible: [{ Amount: 500_000n }] },
      ]),
    );
    expect(errKey(await as("property", viewer).setInsurancePolicy(home, [POLICY]))).toBe("NotAuthorized");
    expect(errKey(await as("property", stranger).setInsurancePolicy(home, [POLICY]))).toBe("NotAuthorized");
    expect(errKey(await as("property", owner).setInsurancePolicy("no-such-home", [POLICY]))).toBe("NotFound");
  });

  it("IP.2 shows the policy to the household only", async () => {
    const [saved] = ok<any[]>(await policyOf(owner));
    expect(saved.carrier).toBe("Citizens Property Insurance");
    expect(saved.policyNumber).toBe("FL-HO3-0043");
    expect(saved.renewalDate).toBe("2027-06-01");
    expect(saved.coverageACents).toEqual([35_000_000n]);
    expect(saved.hurricaneDeductible).toEqual([{ Amount: 500_000n }]);
    expect(saved.updatedAt).toBeGreaterThan(0n);
    expect(ok<any[]>(await policyOf(viewer))).toEqual([saved]);
    expect(ok<any[]>(await policyOf(manager))).toEqual([saved]);
    expect(errKey(await policyOf(stranger))).toBe("NotAuthorized");
    expect(errKey(await policyOf(owner, "no-such-home"))).toBe("NotFound");
    expect(ok<any[]>(await policyOf(owner, secondHome))).toEqual([]);
  });

  it("IP.3 refuses bad input", async () => {
    const bad = [
      { ...POLICY, carrier: "   " },
      { ...POLICY, carrier: "x".repeat(101) },
      { ...POLICY, policyNumber: "x".repeat(61) },
      { ...POLICY, renewalDate: "" },
      { ...POLICY, renewalDate: "06/01/2027" },
      { ...POLICY, renewalDate: "2027-13-01" },
      { ...POLICY, renewalDate: "2027-02-29" },
      { ...POLICY, renewalDate: "1999-01-01" },
      { ...POLICY, hurricaneDeductible: [{ PercentOfCoverageA: 0n }] },
      { ...POLICY, hurricaneDeductible: [{ PercentOfCoverageA: 26n }] },
      { ...POLICY, coverageACents: [10_000_000_001n] },
    ];
    for (const p of bad) {
      expect(errKey(await as("property", owner).setInsurancePolicy(secondHome, [p]))).toBe("InvalidInput");
    }
    // Leap day in a leap year is fine; the optional fields can be left out.
    ok(
      await as("property", owner).setInsurancePolicy(secondHome, [
        { ...POLICY, renewalDate: "2028-02-29", coverageACents: [], hurricaneDeductible: [], policyNumber: "" },
      ]),
    );
    expect(ok<any[]>(await policyOf(owner, secondHome))[0].renewalDate).toBe("2028-02-29");
  });

  it("IP.4 clears the policy with null", async () => {
    ok(await as("property", owner).setInsurancePolicy(secondHome, []));
    expect(ok<any[]>(await policyOf(owner, secondHome))).toEqual([]);
  });

  it("IP.5 gives the relay renewal dates for the owner's homes that have a policy", async () => {
    const renewals = ok<any[]>(await as("property", notifier).getPulseInsurance(owner.getPrincipal()));
    expect(renewals).toEqual([{ propertyId: home, carrier: "Citizens Property Insurance", renewalDate: "2027-06-01" }]);
    expect(ok<any[]>(await as("property", admin).getPulseInsurance(owner.getPrincipal()))).toHaveLength(1);
    expect(errKey(await as("property", owner).getPulseInsurance(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("property", stranger).getPulseInsurance(owner.getPrincipal()))).toBe("NotAuthorized");
  });

  it("IP.6 keeps the policy across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(ok<any[]>(await policyOf(owner))[0].policyNumber).toBe("FL-HO3-0043");
  });

  it("IP.7 drops the seller's policy on a claimed transfer and the owner's on deleteMyData", async () => {
    ok(await as("property", owner).setInsurancePolicy(secondHome, [POLICY]));
    const { token } = ok<any>(await as("property", owner).initiateTransfer(home));
    ok(await as("property", buyer).claimTransfer(token));
    expect(ok<any[]>(await policyOf(buyer))).toEqual([]);

    ok(await as("property", owner).deleteMyData());
    expect(ok<any[]>(await as("property", notifier).getPulseInsurance(owner.getPrincipal()))).toEqual([]);
  });
});
