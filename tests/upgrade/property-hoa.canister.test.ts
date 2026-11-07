/**
 * Condo and HOA paperwork (issue #726): the household logs architectural
 * review requests (addArchitecturalReview, updateArchitecturalReview,
 * deleteArchitecturalReview, getArchitecturalReviews), special assessments
 * (addSpecialAssessment, updateSpecialAssessment, deleteSpecialAssessment,
 * getSpecialAssessments) and, for condos, the association's milestone
 * inspection and reserve study dates (setCondoAssociationRecord,
 * getCondoAssociationRecord), on real property and payment canisters.
 *
 *  HOA.1 owner and managers with write access log reviews; viewers and
 *        strangers can't; the household reads them, newest first
 *  HOA.2 bad review input is refused
 *  HOA.3 special assessments: add, edit, mark paid, delete; bad input refused
 *  HOA.4 the condo association record is for condo homes only, validated,
 *        and cleared with null
 *  HOA.5 everything survives an upgrade
 *  HOA.6 the records stay with the home on a claimed transfer (the buyer
 *        inherits the approvals); deleteMyData drops them
 *
 * Run: cd tests/upgrade && npx vitest run property-hoa.canister.test.ts
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

describe("condo and HOA paperwork", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let condo = "";
  let house = "";
  let fence = "";
  let roofAssessment = "";

  const admin = createIdentity("hoa-admin");
  const owner = createIdentity("hoa-owner");
  const manager = createIdentity("hoa-manager");
  const viewer = createIdentity("hoa-viewer");
  const stranger = createIdentity("hoa-stranger");
  const buyer = createIdentity("hoa-buyer");

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
  const review = (over: Record<string, unknown> = {}) => ({
    project: "Replace the back fence",
    details: "6 ft white vinyl, same line as the old one",
    submittedDate: "2026-03-02",
    status: { Submitted: null },
    decisionDate: "",
    conditions: "",
    approvalDocId: [],
    jobId: [],
    ...over,
  });
  const assessment = (over: Record<string, unknown> = {}) => ({
    title: "Roof replacement",
    amountCents: 450_000n,
    dueDate: "2026-09-01",
    paidDate: "",
    notes: "Two installments allowed",
    documentId: [],
    ...over,
  });
  const condoRecord = (over: Record<string, unknown> = {}) => ({
    associationName: "Bayview Towers Condominium Association",
    milestoneLastDate: "2024-12-15",
    milestoneNextDue: "2034-12-15",
    milestoneDocId: ["doc-milestone"],
    reserveStudyLastDate: "2025-06-30",
    reserveStudyNextDue: "2035-06-30",
    reserveStudyDocId: [],
    notes: "Phase 2 inspection not required",
    ...over,
  });
  const reviews = async (who: Identity, id = condo) => ok<any[]>(await prop(who).getArchitecturalReviews(id));
  const assessments = async (who: Identity, id = condo) => ok<any[]>(await prop(who).getSpecialAssessments(id));
  const register = async (address: string, propertyType: Record<string, null>) =>
    ok<any>(
      await prop(owner).registerProperty({
        address,
        city: "Tampa",
        state: "FL",
        zipCode: "33602",
        propertyType,
        yearBuilt: 1998n,
        squareFeet: 1200n,
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

    condo = await register("400 Bayshore Blvd Unit 1203", { Condo: null });
    house = await register("18 Palm Ct", { SingleFamily: null });
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(owner).inviteManager(condo, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("HOA.1 lets the owner and managers log review requests, and shows them to the household", async () => {
    const added = ok<any>(await prop(owner).addArchitecturalReview(condo, review()));
    fence = added.id;
    expect(fence).toMatch(/^[0-9a-f-]{36}$/);
    expect(added).toMatchObject({ propertyId: condo, project: "Replace the back fence", status: { Submitted: null } });

    const decided = ok<any>(
      await prop(manager).updateArchitecturalReview(
        fence,
        review({
          status: { ApprovedWithConditions: null },
          decisionDate: "2026-03-20",
          conditions: "Must match the neighbours' height",
          approvalDocId: ["doc-approval"],
          jobId: ["job-fence"],
        }),
      ),
    );
    expect(decided).toMatchObject({
      approvalDocId: ["doc-approval"],
      jobId: ["job-fence"],
      decisionDate: "2026-03-20",
    });
    expect(decided.createdAt).toBe(added.createdAt);

    ok(
      await prop(owner).addArchitecturalReview(
        condo,
        review({ project: "Hurricane shutters", submittedDate: "2026-05-01" }),
      ),
    );
    // Not yet submitted: no date needed.
    ok(
      await prop(owner).addArchitecturalReview(
        condo,
        review({ project: "Paint the door", status: { Planned: null }, submittedDate: "" }),
      ),
    );
    expect((await reviews(viewer)).map((r) => r.project)).toEqual([
      "Paint the door",
      "Hurricane shutters",
      "Replace the back fence",
    ]);

    expect(errKey(await prop(viewer).addArchitecturalReview(condo, review()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).addArchitecturalReview(condo, review()))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).updateArchitecturalReview(fence, review()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).deleteArchitecturalReview(fence))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getArchitecturalReviews(condo))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getArchitecturalReviews("no-such-home"))).toBe("NotFound");
    expect(errKey(await prop(owner).addArchitecturalReview("no-such-home", review()))).toBe("NotFound");
  });

  it("HOA.2 refuses bad review input", async () => {
    await nextMinute();
    const bad = [
      review({ project: "  " }),
      review({ project: "x".repeat(121) }),
      review({ details: "x".repeat(2001) }),
      review({ submittedDate: "03/02/2026" }),
      review({ submittedDate: "" }), // submitted needs a date
      review({ status: { Approved: null }, decisionDate: "" }), // a decision needs a date
      review({ status: { Denied: null }, decisionDate: "2026-02-30" }),
      review({ status: { Approved: null }, decisionDate: "2026-03-01" }), // before it was submitted
      review({ conditions: "x".repeat(1001) }),
      review({ approvalDocId: ["bad id!"] }),
      review({ jobId: ["x".repeat(65)] }),
    ];
    for (const r of bad) {
      expect(errKey(await prop(owner).addArchitecturalReview(condo, r))).toBe("InvalidInput");
    }
    await nextMinute();
    for (const r of bad) {
      expect(errKey(await prop(owner).updateArchitecturalReview(fence, r))).toBe("InvalidInput");
    }
    expect(errKey(await prop(owner).updateArchitecturalReview("no-such-review", review()))).toBe("NotFound");
  });

  it("HOA.3 records special assessments as dated costs", async () => {
    await nextMinute();
    const added = ok<any>(await prop(owner).addSpecialAssessment(condo, assessment()));
    roofAssessment = added.id;
    expect(added).toMatchObject({ propertyId: condo, amountCents: 450_000n, dueDate: "2026-09-01", paidDate: "" });
    const paid = ok<any>(
      await prop(manager).updateSpecialAssessment(roofAssessment, assessment({ paidDate: "2026-08-20" })),
    );
    expect(paid.paidDate).toBe("2026-08-20");
    const elevator = ok<any>(
      await prop(owner).addSpecialAssessment(condo, assessment({ title: "Elevator", dueDate: "2027-01-15" })),
    );
    expect((await assessments(viewer)).map((a) => a.title)).toEqual(["Elevator", "Roof replacement"]);

    const bad = [
      assessment({ title: "" }),
      assessment({ title: "x".repeat(121) }),
      assessment({ amountCents: 0n }),
      assessment({ amountCents: 10_000_000_001n }),
      assessment({ dueDate: "" }),
      assessment({ dueDate: "2026-13-01" }),
      assessment({ paidDate: "yesterday" }),
      assessment({ notes: "x".repeat(1001) }),
      assessment({ documentId: ["bad id!"] }),
    ];
    for (const a of bad) {
      expect(errKey(await prop(owner).addSpecialAssessment(condo, a))).toBe("InvalidInput");
    }
    await nextMinute();
    expect(errKey(await prop(viewer).addSpecialAssessment(condo, assessment()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getSpecialAssessments(condo))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).deleteSpecialAssessment(elevator.id))).toBe("NotAuthorized");
    ok(await prop(owner).deleteSpecialAssessment(elevator.id));
    expect((await assessments(owner)).map((a) => a.title)).toEqual(["Roof replacement"]);
    expect(errKey(await prop(owner).deleteSpecialAssessment(elevator.id))).toBe("NotFound");
  });

  it("HOA.4 keeps the condo association's inspection and reserve study dates, for condos only", async () => {
    await nextMinute();
    expect(ok<any>(await prop(owner).getCondoAssociationRecord(condo))).toEqual([]);
    ok(await prop(manager).setCondoAssociationRecord(condo, [condoRecord()]));
    const saved = ok<any[]>(await prop(viewer).getCondoAssociationRecord(condo))[0];
    expect(saved).toMatchObject({ milestoneLastDate: "2024-12-15", milestoneDocId: ["doc-milestone"] });

    expect(errKey(await prop(owner).setCondoAssociationRecord(house, [condoRecord()]))).toBe("InvalidInput");
    expect(errKey(await prop(viewer).setCondoAssociationRecord(condo, [condoRecord()]))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getCondoAssociationRecord(condo))).toBe("NotAuthorized");
    const bad = [
      condoRecord({ associationName: "x".repeat(121) }),
      condoRecord({ milestoneLastDate: "2024-12" }),
      condoRecord({ milestoneNextDue: "2024-02-30" }),
      condoRecord({ reserveStudyLastDate: "June 2025" }),
      condoRecord({ reserveStudyDocId: ["bad id!"] }),
      condoRecord({ notes: "x".repeat(2001) }),
    ];
    for (const c of bad) {
      expect(errKey(await prop(owner).setCondoAssociationRecord(condo, [c]))).toBe("InvalidInput");
    }
    // Every date may be left blank.
    await nextMinute();
    ok(
      await prop(owner).setCondoAssociationRecord(condo, [
        condoRecord({ milestoneLastDate: "", milestoneNextDue: "", reserveStudyLastDate: "", reserveStudyNextDue: "" }),
      ]),
    );
    ok(await prop(owner).setCondoAssociationRecord(condo, []));
    expect(ok<any>(await prop(owner).getCondoAssociationRecord(condo))).toEqual([]);
    ok(await prop(owner).setCondoAssociationRecord(condo, [condoRecord()]));
  });

  it("HOA.5 keeps everything across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect((await reviews(owner)).length).toBe(3);
    expect((await assessments(owner)).map((a) => a.id)).toEqual([roofAssessment]);
    expect(ok<any[]>(await prop(owner).getCondoAssociationRecord(condo))[0].associationName).toMatch(/Bayview/);
  });

  it("HOA.6 keeps the records with the home on a transfer; deleteMyData drops them", async () => {
    await nextMinute();
    ok(
      await prop(owner).deleteArchitecturalReview(
        (await reviews(owner)).find((r) => r.project === "Paint the door").id,
      ),
    );
    const kept = ok<any>(await prop(owner).addArchitecturalReview(house, review({ project: "Pool screen" })));

    const { token } = ok<any>(await prop(owner).initiateTransfer(condo));
    ok(await prop(buyer).claimTransfer(token));
    expect((await reviews(buyer)).map((r) => r.project)).toEqual(["Hurricane shutters", "Replace the back fence"]);
    expect((await assessments(buyer)).length).toBe(1);
    expect(ok<any[]>(await prop(buyer).getCondoAssociationRecord(condo)).length).toBe(1);
    expect(errKey(await prop(owner).getArchitecturalReviews(condo))).toBe("NotAuthorized");

    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(admin).deleteArchitecturalReview(kept.id))).toBe("NotFound");
    // The buyer's home is untouched.
    expect((await reviews(buyer)).length).toBe(2);
  });
});
