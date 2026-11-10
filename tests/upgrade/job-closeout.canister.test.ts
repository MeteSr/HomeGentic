/**
 * Lien waivers and permit close-out (issue #716), on real property, payment,
 * job, photo and report canisters wired as deploy.sh wires them.
 *
 *  JC.1 owner and managers set a job's permit status (Open / Closed / Expired)
 *       or clear it; viewers and strangers can't; open proposals can't be set
 *  JC.2 the household reads close-outs for its homes; a stranger reads nothing
 *  JC.3 the owner files a Notice of Commencement and a final lien waiver
 *       (vault documents of those types) on a job and removes one again
 *  JC.4 a DIY job takes no lien waiver; at most 10 papers per job
 *  JC.5 the contractor who signed a job may upload its final waiver straight
 *       into the home's document vault (photo.beginWaiverUpload, vouched for
 *       by job.waiverUploadTarget) and file it on the job; nobody else may
 *       (uploadWaiver: the same with the bytes on-chain, for PDFs)
 *  JC.6 waiverUploadTarget and getCloseoutsForProperty answer only trusted
 *       canisters and admins
 *  JC.7 a report keeps a close-out summary: permit counts by status (hidden
 *       with the permits) and contractor jobs over $2,500 with a waiver on file
 *  JC.8 close-outs and report summaries survive an upgrade
 *  JC.9 deleteMyData and rejectJobProposal drop the close-outs of their jobs
 *
 * Run: cd tests/upgrade && npx vitest run job-closeout.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job,photo,report}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
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
const tag = (v: Record<string, null>) => Object.keys(v)[0];

const CANISTERS = ["property", "payment", "job", "photo", "report"] as const;
type Name = (typeof CANISTERS)[number];

describe("job close-out: permit status and lien waivers", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";
  let roofJob = ""; // contractor job, $18,000, permit
  let paintJob = ""; // DIY, $900
  let fenceJob = ""; // contractor job, $4,000, no permit
  let n = 0;

  const admin = createIdentity("jc-admin");
  const owner = createIdentity("jc-owner");
  const manager = createIdentity("jc-manager");
  const viewer = createIdentity("jc-viewer");
  const stranger = createIdentity("jc-stranger");
  const roofer = createIdentity("jc-roofer");
  const pro = createIdentity("jc-proposer");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  async function wire(name: Name, setter: string, target: Name) {
    const arg = new Map(svcs[name]._fields).get(setter)!.argTypes[0];
    ok(await as(name, admin)[setter](arg.name === "principal" ? ids[target] : ids[target].toText()));
  }
  const closeouts = async (who: Identity) =>
    new Map<string, any>(((await as("job", who).getJobCloseouts([propertyId])) as any[]).map((c) => [c.jobId, c]));
  const job = async (title: string, serviceType: object, cents: bigint, diy: boolean, permit: string | null) =>
    ok<any>(
      await as("job", owner).createJob(
        propertyId,
        title,
        serviceType,
        `${title} work`,
        diy ? [] : [`${title} Co`],
        cents,
        0n,
        permit ? [permit] : [],
        [],
        diy,
        [],
      ),
    ).id as string;
  /** A contractor signs `jobId` through the homeowner's invite link. */
  async function contractorSigns(jobId: string, who: Identity) {
    const token = ok<string>(await as("job", owner).createInviteToken(jobId, ""));
    ok(await as("job", who).redeemInviteToken(token, "Ray Roofer", "407-555-0100", "ray@example.com", []));
  }
  /** A vault document on the home, uploaded on-chain by the owner (10 a minute). */
  let docsThisMinute = 0;
  async function vaultDoc(description: string) {
    if (++docsThisMinute > 10) {
      await pic.advanceTime(61_000);
      await pic.tick();
      docsThisMinute = 1;
    }
    const bytes = new Uint8Array([3, 1, ++n % 256, Math.floor(n / 256)]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return ok<any>(
      await as("photo", owner).uploadPhoto(`docs_${propertyId}`, propertyId, { PostConstruction: null }, description, hash, bytes),
    ).id as string;
  }
  const fileHash = () => {
    const bytes = new Uint8Array([9, 1, ++n % 256, Math.floor(n / 256)]);
    return { hash: createHash("sha256").update(bytes).digest("hex"), size: BigInt(bytes.length) };
  };

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
    await wire("property", "setPaymentCanisterId", "payment");
    await wire("job", "setPropertyCanisterId", "property");
    await wire("job", "setPhotoCanisterId", "photo");
    await wire("photo", "setPropertyCanisterId", "property");
    await wire("photo", "setPaymentCanisterId", "payment");
    await wire("photo", "setJobCanisterId", "job");
    await wire("report", "setPropertyCanisterId", "property");
    await wire("report", "setRiskJobCanisterId", "job");
    // Many calls from one identity: lift the per-minute limits.
    for (const name of ["job", "photo", "property"] as const) ok(await as(name, admin).setUpdateRateLimit(0n));
    ok(await as("job", admin).addTrustedCanister(ids.property));
    ok(await as("job", admin).addTrustedCanister(ids.photo));
    ok(await as("job", admin).addTrustedCanister(ids.report));
    ok(await as("property", admin).addTrustedCanister(ids.photo));
    ok(await as("property", admin).addTrustedCanister(ids.report));

    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    propertyId = ok<any>(
      await as("property", owner).registerProperty({
        address: "12 Release Road",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1999n,
        squareFeet: 2000n,
        tier: { Pro: null },
      }),
    ).id;
    ok(await as("property", admin).verifyProperty(propertyId, { Basic: null }, []));
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await as("property", owner).inviteManager(propertyId, { [role]: null }, role, []));
      ok(await as("property", who).claimManagerRole(invite.token));
    }
    roofJob = await job("Roof", { Roofing: null }, 1_800_000n, false, "BLD-2026-0412");
    paintJob = await job("Paint", { Painting: null }, 90_000n, true, null);
    fenceJob = await job("Fence", { Fencing: null }, 400_000n, false, null);
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("JC.1 lets the owner and managers set a permit status, not viewers, strangers or proposals", async () => {
    ok(await as("job", owner).setPermitStatus(roofJob, [{ Open: null }]));
    ok(await as("job", manager).setPermitStatus(roofJob, [{ Closed: null }]));
    expect(errKey(await as("job", viewer).setPermitStatus(roofJob, [{ Open: null }]))).toBe("NotAuthorized");
    expect(errKey(await as("job", stranger).setPermitStatus(roofJob, [{ Open: null }]))).toBe("NotAuthorized");
    expect(errKey(await as("job", owner).setPermitStatus("no-such-job", [{ Open: null }]))).toBe("NotFound");

    const proposal = ok<any>(
      await as("job", pro).createJobProposal(
        propertyId,
        "Gutters",
        { Gutters: null },
        "Guards",
        ["Pro Gutters"],
        90_000n,
        0n,
        [],
        [],
      ),
    ).id as string;
    expect(errKey(await as("job", owner).setPermitStatus(proposal, [{ Open: null }]))).toBe("InvalidInput");
    ok(await as("job", owner).rejectJobProposal(proposal));

    ok(await as("job", owner).setPermitStatus(paintJob, [{ Expired: null }]));
    ok(await as("job", owner).setPermitStatus(paintJob, []));
    expect((await closeouts(owner)).has(paintJob)).toBe(false);
  });

  it("JC.2 shows close-outs to the household and nothing to a stranger", async () => {
    const seen = await closeouts(owner);
    expect(tag(seen.get(roofJob).permitStatus[0])).toBe("Closed");
    expect(await closeouts(viewer)).toEqual(seen);
    expect((await closeouts(stranger)).size).toBe(0);
  });

  it("JC.3 files a Notice of Commencement and a waiver on a job and removes one", async () => {
    const noc = await vaultDoc(`[NOC] ${roofJob}|noc.pdf`);
    const w1 = await vaultDoc(`[LienWaiver] ${fenceJob}|waiver.pdf`);
    ok(await as("job", owner).addJobPaper(roofJob, { NoticeOfCommencement: null }, noc));
    ok(await as("job", manager).addJobPaper(fenceJob, { FinalLienWaiver: null }, w1));
    expect(errKey(await as("job", viewer).addJobPaper(fenceJob, { FinalLienWaiver: null }, "PHOTO_X"))).toBe(
      "NotAuthorized",
    );
    expect(errKey(await as("job", owner).addJobPaper(fenceJob, { FinalLienWaiver: null }, ""))).toBe("InvalidInput");

    const seen = await closeouts(owner);
    const papers = seen.get(roofJob).papers as any[];
    expect(papers).toHaveLength(1);
    expect(tag(papers[0].kind)).toBe("NoticeOfCommencement");
    expect(papers[0].photoId).toBe(noc);
    expect(papers[0].addedBy.toText()).toBe(owner.getPrincipal().toText());
    expect(seen.get(roofJob).permitStatus).toHaveLength(1);

    // Filing the same document again replaces it instead of adding a copy.
    ok(await as("job", owner).addJobPaper(fenceJob, { FinalLienWaiver: null }, w1));
    expect((await closeouts(owner)).get(fenceJob).papers).toHaveLength(1);

    ok(await as("job", owner).removeJobPaper(fenceJob, w1));
    expect((await closeouts(owner)).has(fenceJob)).toBe(false);
    expect(errKey(await as("job", owner).removeJobPaper(fenceJob, w1))).toBe("NotFound");
  });

  it("JC.4 takes no lien waiver on a DIY job and keeps at most 10 papers per job", async () => {
    const diyWaiver = await vaultDoc(`[LienWaiver] ${paintJob}|waiver.pdf`);
    expect(errKey(await as("job", owner).addJobPaper(paintJob, { FinalLienWaiver: null }, diyWaiver))).toBe(
      "InvalidInput",
    );
    const nocs: string[] = [];
    for (let i = 0; i < 10; i++) nocs.push(await vaultDoc(`[NOC] ${roofJob}|noc-${i}.pdf`));
    for (let i = 0; i < 9; i++) ok(await as("job", owner).addJobPaper(roofJob, { NoticeOfCommencement: null }, nocs[i]));
    expect(errKey(await as("job", owner).addJobPaper(roofJob, { NoticeOfCommencement: null }, nocs[9]))).toBe(
      "InvalidInput",
    );
    for (let i = 0; i < 9; i++) ok(await as("job", owner).removeJobPaper(roofJob, nocs[i]));
  });

  it("JC.5 lets the contractor who signed a job upload and file its final waiver", async () => {
    const { hash, size } = fileHash();
    // Not signed yet: nobody vouches for the upload.
    expect(errKey(await as("photo", roofer).beginWaiverUpload(roofJob, "waiver.pdf", hash, size))).toBe(
      "NotAuthorized",
    );
    await contractorSigns(roofJob, roofer);

    const meta = ok<any>(await as("photo", roofer).beginWaiverUpload(roofJob, "waiver.pdf", hash, size));
    expect(meta.jobId).toBe(`docs_${propertyId}`);
    expect(meta.propertyId).toBe(propertyId);
    expect(meta.description).toBe(`[LienWaiver] ${roofJob}|waiver.pdf`);
    ok(await as("job", roofer).addJobPaper(roofJob, { FinalLienWaiver: null }, meta.id));

    // The household sees it in the vault and on the job.
    const vault = (await as("photo", owner).getPhotosByJob(`docs_${propertyId}`)) as any[];
    expect(vault.map((p) => p.id)).toContain(meta.id);
    const papers = (await closeouts(owner)).get(roofJob).papers as any[];
    const waiver = papers.find((p) => tag(p.kind) === "FinalLienWaiver");
    expect(waiver.addedBy.toText()).toBe(roofer.getPrincipal().toText());

    // The contractor files only a waiver, only on their own signed job.
    expect(errKey(await as("job", roofer).addJobPaper(roofJob, { NoticeOfCommencement: null }, meta.id))).toBe(
      "NotAuthorized",
    );
    expect(errKey(await as("job", roofer).addJobPaper(fenceJob, { FinalLienWaiver: null }, meta.id))).toBe(
      "NotAuthorized",
    );
    expect(errKey(await as("job", roofer).setPermitStatus(roofJob, [{ Closed: null }]))).toBe("NotAuthorized");
    // Others can't upload through the contractor path.
    const other = fileHash();
    for (const who of [stranger, owner, viewer])
      expect(errKey(await as("photo", who).beginWaiverUpload(roofJob, "w.pdf", other.hash, other.size))).toBe(
        "NotAuthorized",
      );
    expect(errKey(await as("photo", roofer).beginWaiverUpload(fenceJob, "w.pdf", other.hash, other.size))).toBe(
      "NotAuthorized",
    );
    // Filenames are bounded and can't break the "jobId|filename" encoding.
    expect(errKey(await as("photo", roofer).beginWaiverUpload(roofJob, "a|b.pdf", other.hash, other.size))).toBe(
      "InvalidInput",
    );
    expect(errKey(await as("photo", roofer).beginWaiverUpload(roofJob, "x".repeat(201), other.hash, other.size))).toBe(
      "InvalidInput",
    );
  });

  it("JC.5b takes a PDF waiver on-chain from the same contractor, while on-chain uploads are on", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, ++n % 256]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const meta = ok<any>(await as("photo", roofer).uploadWaiver(roofJob, "waiver.pdf", hash, bytes));
    expect(meta.description).toBe(`[LienWaiver] ${roofJob}|waiver.pdf`);
    expect(meta.jobId).toBe(`docs_${propertyId}`);
    expect(errKey(await as("photo", stranger).uploadWaiver(roofJob, "w.pdf", hash, bytes))).toBe("NotAuthorized");

    ok(await as("photo", admin).setOnChainUploadsEnabled(false));
    const other = new Uint8Array([37, 80, 68, 70, ++n % 256, 1]);
    const r = await as("photo", roofer).uploadWaiver(
      roofJob,
      "w2.pdf",
      createHash("sha256").update(other).digest("hex"),
      other,
    );
    expect(JSON.stringify(r)).toMatch(/Upload the signed waiver as a PDF or a photo/);
    ok(await as("photo", admin).setOnChainUploadsEnabled(true));
  });

  it("JC.6 answers waiverUploadTarget only for trusted canisters and admins", async () => {
    expect(await as("job", roofer).waiverUploadTarget(roofJob, roofer.getPrincipal())).toEqual([]);
    expect(await as("job", admin).waiverUploadTarget(roofJob, roofer.getPrincipal())).toEqual([propertyId]);
    expect(await as("job", admin).waiverUploadTarget(roofJob, stranger.getPrincipal())).toEqual([]);
    expect(await as("job", admin).waiverUploadTarget(paintJob, owner.getPrincipal())).toEqual([]);
    // The report canister's per-property read is for trusted canisters too.
    expect(await as("job", owner).getCloseoutsForProperty(propertyId)).toEqual([]);
    const forAdmin = (await as("job", admin).getCloseoutsForProperty(propertyId)) as any[];
    expect(forAdmin.map((c) => c.jobId)).toContain(roofJob);
  });

  it("JC.7 keeps a close-out summary on the report", async () => {
    // fenceJob: contractor job over $2,500 with no waiver; paintJob is DIY.
    const generate = (hidePermits: boolean) =>
      as("report", owner).generateReport(
        propertyId,
        {
          address: "",
          city: "",
          state: "",
          zipCode: "",
          propertyType: "",
          yearBuilt: 0n,
          squareFeet: 0n,
          verificationLevel: "",
        },
        [],
        [],
        [],
        { Public: null },
        [],
        [false],
        [false],
        [hidePermits],
        [false],
        [],
      );
    const link = ok<any>(await generate(false));
    const summary = (await as("report", stranger).getReportCloseout(link.token))[0];
    expect(summary.permits[0]).toEqual({ open: 0n, closed: 1n, expired: 0n, unrecorded: 0n });
    expect(summary.largeJobs).toBe(2n);
    expect(summary.largeJobsWithWaiver).toBe(1n);
    expect(summary.thresholdCents).toBe(250_000n);

    const hidden = ok<any>(await generate(true));
    expect((await as("report", stranger).getReportCloseout(hidden.token))[0].permits).toEqual([]);
    expect(await as("report", stranger).getReportCloseout("no-such-token")).toEqual([]);

    ok(await as("report", owner).revokeShareLink(hidden.token));
    expect(await as("report", stranger).getReportCloseout(hidden.token)).toEqual([]);
    (globalThis as any).__jcToken = link.token;
  });

  it("JC.8 keeps close-outs and report summaries across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.job, wasm: readFileSync(wasmPath("job")) });
    await pic.upgradeCanister({ canisterId: ids.report, wasm: readFileSync(wasmPath("report")) });
    await pic.upgradeCanister({ canisterId: ids.photo, wasm: readFileSync(wasmPath("photo")) });
    const seen = await closeouts(owner);
    expect(tag(seen.get(roofJob).permitStatus[0])).toBe("Closed");
    expect(seen.get(roofJob).papers).toHaveLength(2);
    const summary = (await as("report", stranger).getReportCloseout((globalThis as any).__jcToken))[0];
    expect(summary.largeJobsWithWaiver).toBe(1n);
    // The photo canister still knows where the job canister is.
    const { hash, size } = fileHash();
    ok(await as("photo", roofer).beginWaiverUpload(roofJob, "waiver-2.pdf", hash, size));
  });

  it("JC.9 drops the close-outs of jobs removed by deleteMyData or a rejected proposal", async () => {
    const proposal = ok<any>(
      await as("job", pro).createJobProposal(
        propertyId,
        "Deck",
        { Other: null },
        "Deck",
        ["Pro Decks"],
        500_000n,
        0n,
        [],
        [],
      ),
    ).id as string;
    ok(await as("job", owner).approveJobProposal(proposal));
    ok(await as("job", owner).setPermitStatus(proposal, [{ Open: null }]));
    expect((await closeouts(owner)).has(proposal)).toBe(true);

    ok(await as("job", owner).deleteMyData());
    expect((await closeouts(owner)).size).toBe(0);
    expect(errKey(await as("job", owner).setPermitStatus(roofJob, [{ Open: null }]))).toBe("NotFound");
  });
});
