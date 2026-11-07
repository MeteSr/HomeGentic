/**
 * Improvements and tax basis record (issue #713): the owner marks each job
 * as an improvement or a repair (job canister, setJobCostCategory) and the
 * household reads the marks back (getJobCostCategories), on real property,
 * payment and job canisters wired as deploy.sh wires them.
 *
 *  CC.1 owner and managers with write access can mark a job; viewers and
 *       strangers can't
 *  CC.2 the household reads marks for its homes; a stranger reads nothing
 *  CC.3 a verified (signed) job can still be marked: the mark is the owner's
 *       own note, not part of what was signed
 *  CC.4 null clears a mark; unknown jobs are NotFound; proposals can't be marked
 *  CC.5 marks survive an upgrade (new stable side map, not a Job field)
 *  CC.6 deleteMyData and rejectJobProposal drop the marks of the jobs they remove
 *
 * Run: cd tests/upgrade && npx vitest run job-cost-category.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job}/*.wasm)
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

const CANISTERS = ["property", "payment", "job"] as const;
type Name = (typeof CANISTERS)[number];

describe("job cost categories (improvement vs repair)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";
  let roofJob = "";
  let paintJob = "";

  const admin = createIdentity("cc-admin");
  const owner = createIdentity("cc-owner");
  const manager = createIdentity("cc-manager");
  const viewer = createIdentity("cc-viewer");
  const stranger = createIdentity("cc-stranger");
  const pro = createIdentity("cc-contractor");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const marks = async (who: Identity) =>
    new Map<string, string>(
      ((await as("job", who).getJobCostCategories([propertyId])) as [string, Record<string, null>][]).map(([id, c]) => [
        id,
        Object.keys(c)[0],
      ]),
    );
  const diyJob = async (title: string, serviceType: object) =>
    ok<any>(
      await as("job", owner).createJob(
        propertyId,
        title,
        serviceType,
        `${title} work`,
        [],
        1_250_000n,
        0n,
        [],
        [],
        true,
        [],
      ),
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
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.property));

    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    propertyId = ok<any>(
      await as("property", owner).registerProperty({
        address: "9 Basis Lane",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2004n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id;
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await as("property", owner).inviteManager(propertyId, { [role]: null }, role, []));
      ok(await as("property", who).claimManagerRole(invite.token));
    }
    roofJob = await diyJob("New roof", { Roofing: null });
    paintJob = await diyJob("Touch-up paint", { Painting: null });
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("CC.1 lets the owner and managers mark a job, not viewers or strangers", async () => {
    ok(await as("job", owner).setJobCostCategory(roofJob, [{ Improvement: null }]));
    ok(await as("job", manager).setJobCostCategory(paintJob, [{ Repair: null }]));
    expect(errKey(await as("job", viewer).setJobCostCategory(roofJob, [{ Repair: null }]))).toBe("NotAuthorized");
    expect(errKey(await as("job", stranger).setJobCostCategory(roofJob, [{ Repair: null }]))).toBe("NotAuthorized");
  });

  it("CC.2 shows the marks to the household and nothing to a stranger", async () => {
    const seen = await marks(owner);
    expect(seen.get(roofJob)).toBe("Improvement");
    expect(seen.get(paintJob)).toBe("Repair");
    expect(await marks(viewer)).toEqual(seen);
    expect((await marks(stranger)).size).toBe(0);
  });

  it("CC.3 still lets the owner mark a verified job", async () => {
    const signed = ok<any>(await as("job", owner).verifyJob(paintJob));
    expect(signed.verified).toBe(true);
    ok(await as("job", owner).setJobCostCategory(paintJob, [{ Improvement: null }]));
    expect((await marks(owner)).get(paintJob)).toBe("Improvement");
  });

  it("CC.4 clears a mark with null, rejects unknown jobs and open proposals", async () => {
    ok(await as("job", owner).setJobCostCategory(paintJob, []));
    expect((await marks(owner)).has(paintJob)).toBe(false);
    expect(errKey(await as("job", owner).setJobCostCategory("no-such-job", [{ Repair: null }]))).toBe("NotFound");

    // A contractor proposal isn't part of the record until the owner accepts it.
    const proposal = ok<any>(
      await as("job", pro).createJobProposal(
        propertyId,
        "Gutter guards",
        { Gutters: null },
        "Installed guards",
        ["Pro Gutters"],
        90_000n,
        0n,
        [],
        [],
      ),
    ).id as string;
    expect(errKey(await as("job", owner).setJobCostCategory(proposal, [{ Repair: null }]))).toBe("InvalidInput");
    ok(await as("job", owner).rejectJobProposal(proposal));
  });

  it("CC.5 keeps the marks across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.job, wasm: readFileSync(wasmPath("job")) });
    expect((await marks(owner)).get(roofJob)).toBe("Improvement");
  });

  it("CC.6 drops the marks of jobs removed by deleteMyData or a rejected proposal", async () => {
    const proposal = ok<any>(
      await as("job", pro).createJobProposal(
        propertyId,
        "Fence",
        { Fencing: null },
        "New fence",
        ["Pro Fence"],
        400_000n,
        0n,
        [],
        [],
      ),
    ).id as string;
    ok(await as("job", owner).rejectJobProposal(proposal));
    expect((await marks(owner)).has(proposal)).toBe(false);

    ok(await as("job", owner).deleteMyData());
    expect((await marks(owner)).size).toBe(0);
    expect(errKey(await as("job", owner).setJobCostCategory(roofJob, [{ Repair: null }]))).toBe("NotFound");
  });
});
