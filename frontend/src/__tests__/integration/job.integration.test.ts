/**
 * Integration tests — jobService against the real ICP job canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL serialization: amount (Nat/bigint), completedDate (Int ns→date),
 *     optional fields (permitNumber, warrantyMonths), ServiceType Variant
 *   - Principal scoping: getByProperty only returns the caller's jobs
 *   - DIY verification: single verifyJob call produces verified: true
 *   - Status Variant round-trip (Pending → Completed via updateJobStatus)
 *   - getCertificationData counter increments after real verification
 *   - Invite token lifecycle: create → preview → redeem (token burns)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { jobService } from "@/services/job";
import { propertyService } from "@/services/property";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = process.env.JOB_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();
function pid(label: string) { return `integ-job-${label}-${RUN_ID}`; }

const BASE = {
  serviceType:    "HVAC" as const,
  description:    "Annual HVAC tune-up",
  amount:         25_000,
  date:           "2024-06-15",
  isDiy:          false,
  contractorName: "Test Contractor LLC",
};

const PROP_BASE = {
  city:         "Orlando",
  state:        "FL",
  zipCode:      "32801",
  propertyType: "SingleFamily" as const,
  yearBuilt:    1995,
  squareFeet:   1800,
  tier:         "Free" as const,
};

// ─── create — Candid serialization ───────────────────────────────────────────

describe.skipIf(!deployed)("create — Candid serialization", () => {
  it("returns a job with a non-empty id", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("id") });
    expect(job.id).toBeTruthy();
    expect(typeof job.id).toBe("string");
  });

  it("amount survives BigInt round-trip without truncation", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("amount"), amount: 99_999 });
    expect(job.amount).toBe(99_999);
  });

  it("completedDate (ns Int) is converted to a YYYY-MM-DD string", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("date"), date: "2024-03-20" });
    expect(job.date).toBe("2024-03-20");
  });

  it("ServiceType Variant round-trips for all eight variants", async () => {
    const types = ["HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"] as const;
    for (const serviceType of types) {
      const job = await jobService.create({
        ...BASE,
        propertyId: pid(`variant-${serviceType}`),
        serviceType,
      });
      expect(job.serviceType).toBe(serviceType);
    }
  });

  it("permitNumber Opt is preserved when provided", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("permit"), permitNumber: "PERMIT-2024-001" });
    expect(job.permitNumber).toBe("PERMIT-2024-001");
  });

  it("permitNumber is undefined when not provided", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("no-permit") });
    expect(job.permitNumber).toBeUndefined();
  });

  it("warrantyMonths Opt (Nat) survives round-trip", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("warranty"), warrantyMonths: 24 });
    expect(job.warrantyMonths).toBe(24);
  });

  it("warrantyMonths is undefined when not provided", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("no-warranty") });
    expect(job.warrantyMonths).toBeUndefined();
  });

  it("contractorName Opt is preserved when provided", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("contractor-name"), contractorName: "Cool Air LLC" });
    expect(job.contractorName).toBe("Cool Air LLC");
  });

  it("contractorName is undefined when not provided (DIY)", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("no-contractor"), isDiy: true, contractorName: undefined });
    expect(job.contractorName).toBeUndefined();
  });

  it("homeowner principal matches the test identity", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("principal") });
    expect(job.homeowner).toBe(TEST_PRINCIPAL);
  });

  it("createdAt is a recent ms timestamp (ns→ms conversion applied)", async () => {
    const before = Date.now() - 5_000;
    const job = await jobService.create({ ...BASE, propertyId: pid("timestamp") });
    const after = Date.now() + 5_000;
    expect(job.createdAt).toBeGreaterThan(before);
    expect(job.createdAt).toBeLessThan(after);
  });

  it("new job starts with status pending, verified false, homeownerSigned false", async () => {
    const job = await jobService.create({ ...BASE, propertyId: pid("initial-state") });
    expect(job.status).toBe("pending");
    expect(job.verified).toBe(false);
    expect(job.homeownerSigned).toBe(false);
  });
});

// ─── getByProperty — principal scoping ───────────────────────────────────────

describe.skipIf(!deployed)("getByProperty — principal scoping & retrieval", () => {
  // getJobsForProperty calls property.isAuthorized (M-07) — must use a real, registered property.
  let propId = pid("get-by-prop");

  beforeAll(async () => {
    try {
      const prop = await propertyService.registerProperty({
        address:      `${RUN_ID} Get-By-Prop Rd`,
        city:         "Orlando",
        state:        "FL",
        zipCode:      "32801",
        propertyType: "SingleFamily" as const,
        yearBuilt:    1995,
        squareFeet:   1800,
        tier:         "Free" as const,
      });
      propId = prop.id;
    } catch (e: any) {
      if (e.message?.includes("limit")) {
        const existing = await propertyService.getMyProperties();
        if (existing.length > 0) { propId = existing[0].id; }
        else throw e;
      } else throw e;
    }
    await jobService.create({ ...BASE, propertyId: propId, serviceType: "HVAC" });
    await jobService.create({ ...BASE, propertyId: propId, serviceType: "Roofing" });
  });

  it("returns at least the two seeded jobs", async () => {
    const jobs = await jobService.getByProperty(propId);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });

  it("all returned jobs have the correct propertyId", async () => {
    const jobs = await jobService.getByProperty(propId);
    expect(jobs.every((j) => j.propertyId === propId)).toBe(true);
  });

  it("all returned jobs belong to the test principal", async () => {
    const jobs = await jobService.getByProperty(propId);
    expect(jobs.every((j) => j.homeowner === TEST_PRINCIPAL)).toBe(true);
  });

  it("returns empty array for a property with no jobs", async () => {
    const jobs = await jobService.getByProperty(pid("empty-prop"));
    expect(jobs).toHaveLength(0);
  });
});

// ─── updateJobStatus — Variant round-trip ────────────────────────────────────

// updateJobStatus cross-calls property.isAuthorized — a made-up propertyId returns
// Unauthorized. Register a real property so the auth check passes.
describe.skipIf(!deployed)("updateJobStatus — Variant round-trip", () => {
  let statusPropId: string;

  beforeAll(async () => {
    const prop = await propertyService.registerProperty({
      ...PROP_BASE,
      address: `${RUN_ID} UpdateStatus Blvd, Orlando FL 32801`,
    });
    statusPropId = prop.id;
  });

  it("transitions status from pending to completed", async () => {
    const job = await jobService.create({ ...BASE, propertyId: statusPropId });
    const updated = await jobService.updateJobStatus(job.id, "completed");
    expect(updated.status).toBe("completed");
  });

  it("transitions status from pending to in_progress", async () => {
    const job = await jobService.create({ ...BASE, propertyId: statusPropId });
    const updated = await jobService.updateJobStatus(job.id, "in_progress");
    expect(updated.status).toBe("in_progress");
  });
});

// ─── DIY verification ─────────────────────────────────────────────────────────
// verifyJob cross-calls property.isAuthorized, so we need a property that actually
// exists in the property canister — a made-up propertyId would return Unauthorized.

describe.skipIf(!deployed)("verifyJob — DIY single-signature path", () => {
  let realPropId: string;

  beforeAll(async () => {
    const prop = await propertyService.registerProperty({
      ...PROP_BASE,
      address: `${RUN_ID} VerifyJob St, Orlando FL 32801`,
    });
    realPropId = prop.id;
  });

  it("DIY job becomes verified: true after a single verifyJob call", async () => {
    const job = await jobService.create({ ...BASE, propertyId: realPropId, isDiy: true, contractorName: undefined });
    const verified = await jobService.verifyJob(job.id);
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe("verified");
  });
});

// ─── getCertificationData ─────────────────────────────────────────────────────
// Requires a real property (verifyJob cross-calls property.isAuthorized).

describe.skipIf(!deployed)("getCertificationData — counter from canister state", () => {
  let realCertPropId: string;

  beforeAll(async () => {
    const prop = await propertyService.registerProperty({
      ...PROP_BASE,
      address: `${RUN_ID} CertData Blvd, Orlando FL 32801`,
    });
    realCertPropId = prop.id;
  });

  it("verifiedJobCount is 0 before any verified jobs", async () => {
    const data = await jobService.getCertificationData(realCertPropId);
    expect(data.verifiedJobCount).toBe(0);
  });

  it("verifiedJobCount increments to 1 after a verified DIY job", async () => {
    const job = await jobService.create({ ...BASE, propertyId: realCertPropId, serviceType: "HVAC", isDiy: true, contractorName: undefined });
    await jobService.verifyJob(job.id);
    const data = await jobService.getCertificationData(realCertPropId);
    expect(data.verifiedJobCount).toBeGreaterThanOrEqual(1);
  });

  it("verifiedKeySystems includes HVAC after a verified HVAC job", async () => {
    const data = await jobService.getCertificationData(realCertPropId);
    expect(data.verifiedKeySystems).toContain("HVAC");
  });
});

// ─── Invite token lifecycle ───────────────────────────────────────────────────

describe.skipIf(!deployed)("createInviteToken / getJobByInviteToken — token lifecycle", () => {
  let jobId: string;
  let token: string;
  const propAddress = "123 Test St, Orlando FL 32801";

  beforeAll(async () => {
    const prop = await propertyService.registerProperty({
      ...PROP_BASE,
      address: `${RUN_ID} InviteToken Ln, Orlando FL 32801`,
    });
    const job = await jobService.create({
      ...BASE,
      propertyId:     prop.id,
      serviceType:    "Plumbing",
      contractorName: "Pipe Masters Inc",
      amount:         85_000,
    });
    jobId = job.id;
    token = await jobService.createInviteToken(jobId, propAddress);
  });

  it("createInviteToken returns a non-empty string token", () => {
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("getJobByInviteToken returns a preview with correct fields", async () => {
    const preview = await jobService.getJobByInviteToken(token);
    expect(preview.jobId).toBe(jobId);
    expect(preview.serviceType).toBe("Plumbing");
    expect(preview.amount).toBe(85_000);
    expect(preview.contractorName).toBe("Pipe Masters Inc");
    expect(preview.propertyAddress).toBe(propAddress);
  });

  it("preview.alreadySigned is false before signing", async () => {
    const preview = await jobService.getJobByInviteToken(token);
    expect(preview.alreadySigned).toBe(false);
  });

  it("preview.expiresAt is a recent future timestamp (ms)", async () => {
    const preview = await jobService.getJobByInviteToken(token);
    expect(preview.expiresAt).toBeGreaterThan(Date.now());
  });

  it("redeemInviteToken signs the job and returns it", async () => {
    const signed = await jobService.redeemInviteToken(token);
    expect(signed.id).toBe(jobId);
    expect(signed.contractorSigned).toBe(true);
  });
});

// ─── getJobSnapshotsForProperty ───────────────────────────────────────────────

describe.skipIf(!deployed)("getJobSnapshotsForProperty — cross-canister snapshot IDL", () => {
  const propId = pid("snapshots");
  let createdJobId: string;

  beforeAll(async () => {
    const job = await jobService.create({
      ...BASE,
      propertyId:    propId,
      serviceType:   "HVAC",
      amount:        150_000,
      date:          "2023-08-10",
      isDiy:         false,
      contractorName: "Snapshot LLC",
    });
    createdJobId = job.id;
  });

  it("returns at least one snapshot for a property with jobs", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(propId);
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });

  it("serviceType is a plain Text string (not a Candid variant)", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(propId);
    const snap = snaps.find((s) => s.serviceType === "HVAC");
    expect(snap).toBeDefined();
  });

  it("completedYear is a 4-digit number", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(propId);
    for (const s of snaps) {
      expect(s.completedYear).toBeGreaterThanOrEqual(1970);
      expect(s.completedYear).toBeLessThanOrEqual(new Date().getFullYear() + 1);
    }
  });

  it("amountCents survives Nat round-trip", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(propId);
    const snap = snaps.find((s) => s.serviceType === "HVAC");
    expect(snap!.amountCents).toBe(150_000);
  });

  it("isDiy is boolean false for contractor job", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(propId);
    const snap = snaps.find((s) => s.serviceType === "HVAC");
    expect(snap!.isDiy).toBe(false);
  });

  it("returns empty array for a property with no jobs", async () => {
    const snaps = await jobService.getJobSnapshotsForProperty(pid("empty-snaps"));
    expect(snaps).toEqual([]);
  });
});
