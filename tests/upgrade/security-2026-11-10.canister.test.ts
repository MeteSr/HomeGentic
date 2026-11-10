/**
 * Security re-audit 2026-11-10 (/mnt/project-files/audits/security-2026-11-10.md),
 * the Medium findings, on real property, payment, job, photo and report
 * canisters wired as deploy-canisters.sh wires them.
 *
 *  M-2 close-out papers are real vault documents of the right kind
 *   S2.1 addJobPaper takes only a vault document on the job's own home whose
 *        type matches the paper (LienWaiver / NOC); made-up ids, job photos,
 *        other homes' documents and other document types are refused
 *   S2.2 deleting the document takes the paper off the job, so a report made
 *        afterwards no longer counts the waiver
 *   S2.3 photo.getPaperDocument answers only the job canister and admins
 *
 *  M-1 the seller's personal papers don't pass to the buyer
 *   S1.1 after a transfer the buyer can't list, read, fetch or delete the
 *        seller's closing, title, insurance, deed, HOA and "other" documents
 *        or their insurance-claim and inventory photos; work records and job
 *        photos still go with the home
 *   S1.2 the seller (uploader) still lists and reads their own files
 *   S1.3 the hidden files don't use up the buyer's document allowance
 *   S1.4 photo.propertyTransferred answers only the property canister and
 *        admins; what it hid survives an upgrade
 *   S1.5 an heir who completes a succession claim does see the owner's
 *        personal papers, claims and inventory (Mete, 2026-11-10): only a
 *        sale seals or drops them
 *
 *  M-3 per-home record caps follow the owner's plan
 *   S3.1 a Free home holds at most 10 insurance claims, 50 log entries per
 *        claim, 100 inventory items, 25 review requests, 25 special
 *        assessments and 25 home warranty claims
 *   S3.2 a Pro home keeps the higher caps (one past each Free cap is fine)
 *
 * Run: cd tests/upgrade && npx vitest run security-2026-11-10.canister.test.ts
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

const CANISTERS = ["property", "payment", "job", "photo", "report"] as const;
type Name = (typeof CANISTERS)[number];

describe("security re-audit 2026-11-10: Medium findings", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let n = 0;

  const admin = createIdentity("s11-admin");
  const owner = createIdentity("s11-owner");
  const neighbour = createIdentity("s11-neighbour");
  const stranger = createIdentity("s11-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  async function wire(name: Name, setter: string, target: Name) {
    const arg = new Map(svcs[name]._fields).get(setter)!.argTypes[0];
    ok(await as(name, admin)[setter](arg.name === "principal" ? ids[target] : ids[target].toText()));
  }
  const register = async (who: Identity, address: string) =>
    ok<any>(
      await as("property", who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1999n,
        squareFeet: 2000n,
        tier: { Pro: null },
      }),
    ).id as string;
  const createJob = async (who: Identity, propertyId: string, title: string, cents: bigint) =>
    ok<any>(
      await as("job", who).createJob(
        propertyId,
        title,
        { Roofing: null },
        `${title} work`,
        [`${title} Co`],
        cents,
        0n,
        [],
        [],
        false,
        [],
      ),
    ).id as string;

  /** Uploads one distinct on-chain file; waits out the 10-a-minute photo limit. */
  const sinceWait = new Map<string, number>();
  async function upload(who: Identity, jobId: string, propertyId: string, description: string) {
    const k = who.getPrincipal().toText();
    const c = (sinceWait.get(k) ?? 0) + 1;
    if (c > 10) {
      await pic.advanceTime(61_000);
      await pic.tick();
      sinceWait.clear();
      sinceWait.set(k, 1);
    } else sinceWait.set(k, c);
    const bytes = new Uint8Array([11, 10, ++n % 256, Math.floor(n / 256)]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return as("photo", who).uploadPhoto(jobId, propertyId, { PostConstruction: null }, description, hash, bytes);
  }
  const doc = async (who: Identity, propertyId: string, description: string) =>
    ok<any>(await upload(who, `docs_${propertyId}`, propertyId, description)).id as string;

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
    await wire("property", "setPhotoCanisterId", "photo");
    await wire("job", "setPropertyCanisterId", "property");
    await wire("job", "setPhotoCanisterId", "photo");
    await wire("photo", "setPropertyCanisterId", "property");
    await wire("photo", "setPaymentCanisterId", "payment");
    await wire("photo", "setJobCanisterId", "job");
    await wire("report", "setPropertyCanisterId", "property");
    await wire("report", "setRiskJobCanisterId", "job");
    for (const name of ["job", "photo", "property"] as const) ok(await as(name, admin).setUpdateRateLimit(0n));
    ok(await as("job", admin).addTrustedCanister(ids.property));
    ok(await as("job", admin).addTrustedCanister(ids.photo));
    ok(await as("job", admin).addTrustedCanister(ids.report));
    ok(await as("property", admin).addTrustedCanister(ids.photo));
    ok(await as("property", admin).addTrustedCanister(ids.report));
    for (const who of [owner, neighbour])
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  // ── M-2 ──────────────────────────────────────────────────────────────────

  describe("M-2 close-out papers", () => {
    let home = "";
    let otherHome = "";
    let roofJob = "";
    let waiverDoc = "";
    let nocDoc = "";
    let reportToken = "";

    const papers = async (jobId: string) =>
      (((await as("job", owner).getJobCloseouts([home])) as any[]).find((c) => c.jobId === jobId)?.papers ??
        []) as any[];
    const generate = () =>
      as("report", owner).generateReport(
        home,
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
        [false],
        [false],
        [],
      );

    beforeAll(async () => {
      home = await register(owner, "1 Waiver Way");
      otherHome = await register(neighbour, "2 Waiver Way");
      ok(await as("property", admin).verifyProperty(home, { Basic: null }, []));
      roofJob = await createJob(owner, home, "Roof", 1_800_000n);
      waiverDoc = await doc(owner, home, `[LienWaiver] ${roofJob}|waiver.pdf`);
      nocDoc = await doc(owner, home, `[NOC] ${roofJob}|noc.pdf`);
    });

    it("S2.1 takes only a vault document on the job's home whose type matches the paper", async () => {
      const jobPhoto = ok<any>(await upload(owner, roofJob, home, "after")).id as string;
      const receipt = await doc(owner, home, "[Receipt] shingles.pdf");
      const neighboursWaiver = await doc(neighbour, otherHome, `[LienWaiver] x|theirs.pdf`);

      for (const [kind, id] of [
        ["FinalLienWaiver", "PHOTO_MADE_UP"],
        ["FinalLienWaiver", jobPhoto],
        ["FinalLienWaiver", receipt],
        ["FinalLienWaiver", neighboursWaiver],
        ["FinalLienWaiver", nocDoc],
        ["NoticeOfCommencement", waiverDoc],
      ] as const)
        expect([kind, id, errKey(await as("job", owner).addJobPaper(roofJob, { [kind]: null }, id))]).toEqual([
          kind,
          id,
          "InvalidInput",
        ]);

      ok(await as("job", owner).addJobPaper(roofJob, { FinalLienWaiver: null }, waiverDoc));
      ok(await as("job", owner).addJobPaper(roofJob, { NoticeOfCommencement: null }, nocDoc));
      expect((await papers(roofJob)).map((p) => p.photoId).sort()).toEqual([nocDoc, waiverDoc].sort());
    });

    it("S2.2 takes the paper off the job when its document is deleted", async () => {
      reportToken = ok<any>(await generate()).token;
      expect((await as("report", stranger).getReportCloseout(reportToken))[0].largeJobsWithWaiver).toBe(1n);

      ok(await as("photo", owner).deletePhoto(waiverDoc));
      expect((await papers(roofJob)).map((p) => p.photoId)).toEqual([nocDoc]);

      const after = ok<any>(await generate()).token;
      expect((await as("report", stranger).getReportCloseout(after))[0].largeJobsWithWaiver).toBe(0n);
    });

    it("S2.3 answers getPaperDocument only for the job canister and admins", async () => {
      expect(await as("photo", owner).getPaperDocument(nocDoc)).toEqual([]);
      expect(await as("photo", stranger).getPaperDocument(nocDoc)).toEqual([]);
      expect(await as("photo", admin).getPaperDocument(nocDoc)).toEqual([{ propertyId: home, docType: "NOC" }]);
      expect(await as("photo", admin).getPaperDocument("PHOTO_MADE_UP")).toEqual([]);
      // Only photo may tell job a document is gone.
      expect(errKey(await as("job", stranger).paperDocumentDeleted(nocDoc, home))).toBe("NotAuthorized");
      expect((await papers(roofJob)).map((p) => p.photoId)).toEqual([nocDoc]);
    });
  });

  // ── M-1 ──────────────────────────────────────────────────────────────────

  describe("M-1 seller's personal papers after a transfer", () => {
    const seller = createIdentity("s11-seller");
    const buyer = createIdentity("s11-buyer");
    let home = "";
    let job = "";
    const personal: string[] = [];
    const shared: string[] = [];

    const listed = async (who: Identity, jobId: string) =>
      ((await as("photo", who).getPhotosByJob(jobId)) as any[]).map((p) => p.id as string);

    beforeAll(async () => {
      // Seller and buyer are both on Free, so S1.3 can check the 25-document limit.
      home = await register(seller, "3 Closing Court");
      job = await createJob(seller, home, "Roof", 900_000n);
      for (const t of ["Closing", "Title", "Insurance", "Deed", "HOA", "Other"])
        personal.push(await doc(seller, home, `[${t}] ${t.toLowerCase()}.pdf`));
      personal.push(ok<any>(await upload(seller, "claim_c1", home, "[Claim] kitchen.jpg")).id);
      personal.push(ok<any>(await upload(seller, "inventory_i1", home, "TV receipt")).id);
      for (const t of ["Receipt", "Permit", "Inspection", "Warranty", "Survey", "Elevation", "Manual"])
        shared.push(await doc(seller, home, `[${t}] ${t.toLowerCase()}.pdf`));
      shared.push(await doc(seller, home, "old-style receipt without a type.pdf"));
      shared.push(ok<any>(await upload(seller, job, home, "roof after")).id);
      // Free has room for 25 documents: 6 personal + 8 shared so far; fill the
      // rest of the seller's allowance with personal ones.
      for (let i = 0; i < 11; i++) personal.push(await doc(seller, home, `[Closing] page-${i}.pdf`));

      const { token } = ok<any>(await as("property", seller).initiateTransfer(home));
      ok(await as("property", buyer).claimTransfer(token));
    }, 180_000);

    it("S1.1 hides the seller's personal files from the buyer and keeps work records", async () => {
      const seen = new Set([
        ...(await listed(buyer, `docs_${home}`)),
        ...(await listed(buyer, job)),
        ...(await listed(buyer, "claim_c1")),
        ...(await listed(buyer, "inventory_i1")),
        ...((await as("photo", buyer).getPhotosByProperty(home)) as any[]).map((p) => p.id),
      ]);
      for (const id of shared) expect([id, seen.has(id)]).toEqual([id, true]);
      for (const id of personal) expect([id, seen.has(id)]).toEqual([id, false]);

      const closing = personal[0];
      expect(errKey(await as("photo", buyer).getPhotoData(closing))).toBe("NotAuthorized");
      expect(errKey(await as("photo", buyer).getPhoto(closing))).toBe("NotAuthorized");
      expect(errKey(await as("photo", buyer).deletePhoto(closing))).toBe("NotAuthorized");
      expect(errKey(await as("photo", buyer).verifyPhoto(closing))).toBe("NotAuthorized");
      const batch = (await as("photo", buyer).getPhotoDataBatch([closing, shared[0]])) as [string, any][];
      expect(batch.map(([id]) => id)).toEqual([shared[0]]);
      // What the Worker asks before serving off-chain bytes.
      const access = (await as("photo", admin).photoAccess(closing, buyer.getPrincipal()))[0];
      expect(access.canRead).toBe(false);
      expect((await as("photo", admin).photoAccess(shared[0], buyer.getPrincipal()))[0].canRead).toBe(true);
      ok(await as("photo", buyer).getPhotoData(shared[0]));
    });

    it("S1.2 lets the seller keep listing and reading their own files", async () => {
      const mine = new Set(await listed(seller, `docs_${home}`));
      for (const id of personal.filter((_, i) => i !== 6 && i !== 7)) expect(mine.has(id)).toBe(true);
      ok(await as("photo", seller).getPhotoData(personal[0]));
      expect((await as("photo", admin).photoAccess(personal[0], seller.getPrincipal()))[0].canRead).toBe(true);
    });

    it("S1.3 doesn't count the hidden files against the buyer's document limit", async () => {
      // 8 shared documents stay on the home, so a Free buyer may add 17 more.
      for (let i = 0; i < 17; i++) await doc(buyer, home, `[Receipt] buyer-${i}.pdf`);
      expect(errKey(await upload(buyer, `docs_${home}`, home, "[Receipt] one-too-many.pdf"))).toBe("QuotaExceeded");
    });

    it("S1.4 takes propertyTransferred only from the property canister and admins, and keeps it on upgrade", async () => {
      expect(errKey(await as("photo", stranger).propertyTransferred(home))).toBe("NotAuthorized");
      expect(errKey(await as("photo", buyer).propertyTransferred(home))).toBe("NotAuthorized");
      await pic.upgradeCanister({ canisterId: ids.photo, wasm: readFileSync(wasmPath("photo")) });
      expect(errKey(await as("photo", buyer).getPhotoData(personal[0]))).toBe("NotAuthorized");
      expect(new Set(await listed(buyer, `docs_${home}`)).has(personal[0])).toBe(false);
    });
  });

  describe("M-1 an heir after a completed succession claim", () => {
    const decedent = createIdentity("s15-owner");
    const heir = createIdentity("s15-heir");
    const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);

    it("S1.5 lets the heir see the owner's personal papers, claims and inventory (unlike a buyer)", async () => {
      const home = await register(decedent, "15 Heritage Lane");
      const closing = await doc(decedent, home, "[Closing] settlement.pdf");
      const insurance = await doc(decedent, home, "[Insurance] policy.pdf");
      const claimPhoto = ok<any>(await upload(decedent, "claim_h1", home, "[Claim] roof.jpg")).id as string;
      const receipt = await doc(decedent, home, "[Receipt] roof.pdf");
      const p = as("property", decedent);
      ok(
        await p.createInsuranceClaim(home, {
          title: "Roof leak",
          dateOfLoss: "2026-09-28",
          cause: "Wind",
          description: "",
          claimNumber: "",
          adjusterName: "",
          adjusterContact: "",
          status: { Open: null },
        }),
      );
      ok(
        await p.addInventoryItem(home, {
          roomId: [],
          name: "Piano",
          category: "Furniture",
          quantity: 1n,
          valueCents: [],
          purchaseDate: "",
          serialNumber: "",
          notes: "",
        }),
      );

      const { token } = ok<any>(
        await as("property", decedent).setSuccessor(home, {
          name: "Jordan Rivera",
          email: "jordan@example.com",
          relationship: "Daughter",
        }),
      );
      const claim = ok<any>(
        await as("property", heir).openSuccessionClaim(
          token,
          {
            claimantName: "Jordan Rivera",
            proofKind: { DeathCertificate: null },
            fileName: "certificate.pdf",
            mimeType: "application/pdf",
            note: "",
          },
          PDF,
        ),
      );
      ok(await as("property", admin).reviewSuccessionClaim(claim.id, true, ""));
      await pic.advanceTime(30 * 24 * 60 * 60 * 1000 + 61_000);
      await pic.tick();
      ok(await as("property", heir).completeSuccessionClaim(claim.id));

      const seen = new Set([
        ...((await as("photo", heir).getPhotosByJob(`docs_${home}`)) as any[]).map((p) => p.id),
        ...((await as("photo", heir).getPhotosByJob("claim_h1")) as any[]).map((p) => p.id),
      ]);
      for (const id of [closing, insurance, claimPhoto, receipt]) expect([id, seen.has(id)]).toEqual([id, true]);
      ok(await as("photo", heir).getPhotoData(closing));
      expect((await as("photo", admin).photoAccess(insurance, heir.getPrincipal()))[0].canRead).toBe(true);
      // The claims and inventory those photos belong to stay with the home too.
      expect(ok<any[]>(await as("property", heir).getInsuranceClaims(home)).map((c) => c.title)).toEqual(["Roof leak"]);
      expect(ok<any[]>(await as("property", heir).getInventory(home)).map((i) => i.name)).toEqual(["Piano"]);
    }, 120_000);
  });

  // ── M-3 ──────────────────────────────────────────────────────────────────

  describe("M-3 per-home caps follow the owner's plan", () => {
    const claim = (title: string) => ({
      title,
      dateOfLoss: "2026-09-28",
      cause: "Water leak",
      description: "",
      claimNumber: "",
      adjusterName: "",
      adjusterContact: "",
      status: { Open: null },
    });
    const item = (name: string) => ({
      roomId: [],
      name,
      category: "Electronics",
      quantity: 1n,
      valueCents: [],
      purchaseDate: "",
      serialNumber: "",
      notes: "",
    });
    const review = (project: string) => ({
      project,
      details: "",
      submittedDate: "2026-03-02",
      status: { Submitted: null },
      decisionDate: "",
      conditions: "",
      approvalDocId: [],
      jobId: [],
    });
    const assessment = (title: string) => ({
      title,
      amountCents: 1_000n,
      dueDate: "2026-09-01",
      paidDate: "",
      notes: "",
      documentId: [],
    });
    const hwClaim = (issue: string) => ({
      dateFiled: "2026-07-02",
      issue,
      claimNumber: "",
      jobId: [],
      serviceFeePaidCents: [],
      outcome: { Open: null },
      outcomeNotes: "",
    });

    /** Fills each list to `count` and returns the error key of one more. */
    async function fill(who: Identity, home: string, count: Record<string, number>) {
      const p = as("property", who);
      const out: Record<string, string> = {};
      let firstClaim = "";
      for (let i = 0; i < count.claims; i++) {
        const c = ok<any>(await p.createInsuranceClaim(home, claim(`Claim ${i}`)));
        if (i === 0) firstClaim = c.id;
      }
      out.claims = errKey(await p.createInsuranceClaim(home, claim("One more")));
      for (let i = 0; i < count.log; i++) ok(await p.addInsuranceClaimLog(firstClaim, "2026-10-01", `Note ${i}`));
      out.log = errKey(await p.addInsuranceClaimLog(firstClaim, "2026-10-01", "One more"));
      for (let i = 0; i < count.inventory; i++) ok(await p.addInventoryItem(home, item(`Item ${i}`)));
      out.inventory = errKey(await p.addInventoryItem(home, item("One more")));
      for (let i = 0; i < count.reviews; i++) ok(await p.addArchitecturalReview(home, review(`Review ${i}`)));
      out.reviews = errKey(await p.addArchitecturalReview(home, review("One more")));
      for (let i = 0; i < count.assessments; i++) ok(await p.addSpecialAssessment(home, assessment(`Fee ${i}`)));
      out.assessments = errKey(await p.addSpecialAssessment(home, assessment("One more")));
      for (let i = 0; i < count.warranty; i++) ok(await p.addHomeWarrantyClaim(home, hwClaim(`Issue ${i}`)));
      out.warranty = errKey(await p.addHomeWarrantyClaim(home, hwClaim("One more")));
      return out;
    }

    it("S3.1 caps a Free home's records", async () => {
      const freeOwner = createIdentity("s11-free-owner");
      const home = await register(freeOwner, "4 Free Street");
      const refused = await fill(freeOwner, home, {
        claims: 10,
        log: 50,
        inventory: 100,
        reviews: 25,
        assessments: 25,
        warranty: 25,
      });
      expect(refused).toEqual({
        claims: "InvalidInput",
        log: "InvalidInput",
        inventory: "InvalidInput",
        reviews: "InvalidInput",
        assessments: "InvalidInput",
        warranty: "InvalidInput",
      });
    }, 120_000);

    it("S3.2 keeps the higher caps on a Pro home", async () => {
      const home = await register(owner, "5 Pro Street");
      const allowed = await fill(owner, home, {
        claims: 10,
        log: 50,
        inventory: 100,
        reviews: 25,
        assessments: 25,
        warranty: 25,
      });
      expect(allowed).toEqual({
        claims: "ok",
        log: "ok",
        inventory: "ok",
        reviews: "ok",
        assessments: "ok",
        warranty: "ok",
      });
    }, 120_000);
  });
});
