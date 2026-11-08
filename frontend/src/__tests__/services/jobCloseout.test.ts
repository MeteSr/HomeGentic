/**
 * #716 permit close-out and lien waivers: which jobs have open or expired
 * permits, which larger contractor jobs have no final lien waiver on file,
 * and when a Florida Notice of Commencement is generally expected.
 */
import { describe, it, expect } from "vitest";
import type { Job } from "@/services/job";
import {
  LARGE_JOB_CENTS,
  closeoutReview,
  needsLienWaiver,
  nocExpected,
  permitStatusOf,
  hasPaper,
  type JobCloseout,
} from "@/services/jobCloseout";

function job(over: Partial<Job> = {}): Job {
  return {
    id: "j",
    propertyId: "p",
    homeowner: "me",
    serviceType: "Roofing",
    contractorName: "Acme",
    amount: 1_000_000,
    date: "2026-03-01",
    description: "Roof",
    isDiy: false,
    status: "verified",
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    photos: [],
    createdAt: 0,
    ...over,
  };
}
const waiver = (jobId: string): JobCloseout => ({
  jobId,
  papers: [{ kind: "lienWaiver", photoId: "PHOTO_1", addedBy: "pro", addedAt: 1 }],
});

describe("needsLienWaiver", () => {
  it("asks for a waiver on contractor jobs over $2,500 only", () => {
    expect(LARGE_JOB_CENTS).toBe(250_000);
    expect(needsLienWaiver(job({ amount: 250_001 }))).toBe(true);
    expect(needsLienWaiver(job({ amount: 250_000 }))).toBe(false);
    expect(needsLienWaiver(job({ isDiy: true, contractorName: undefined }))).toBe(false);
  });

  it("leaves out open and rejected proposals", () => {
    expect(needsLienWaiver(job({ status: "pending_homeowner_approval" }))).toBe(false);
    expect(needsLienWaiver(job({ status: "rejected_by_homeowner" }))).toBe(false);
  });
});

describe("nocExpected", () => {
  it("expects a Florida Notice of Commencement over $2,500", () => {
    expect(nocExpected(job({ amount: 300_000 }), "FL")).toBe(true);
    expect(nocExpected(job({ amount: 250_000 }), "FL")).toBe(false);
    expect(nocExpected(job({ amount: 300_000 }), "fl")).toBe(true);
  });

  it("uses $15,000 for heating and air-conditioning work", () => {
    expect(nocExpected(job({ serviceType: "HVAC", amount: 1_200_000 }), "FL")).toBe(false);
    expect(nocExpected(job({ serviceType: "HVAC", amount: 1_500_001 }), "FL")).toBe(true);
  });

  it("says nothing outside Florida or for DIY work", () => {
    expect(nocExpected(job({ amount: 5_000_000 }), "GA")).toBe(false);
    expect(nocExpected(job({ amount: 5_000_000 }), undefined)).toBe(false);
    expect(nocExpected(job({ amount: 5_000_000, isDiy: true }), "FL")).toBe(false);
  });
});

describe("closeoutReview", () => {
  const roof = job({ id: "roof", permitNumber: "BLD-1" });
  const fence = job({ id: "fence", amount: 400_000 });
  const deck = job({ id: "deck", amount: 900_000, permitNumber: "BLD-2" });
  const pool = job({ id: "pool", amount: 900_000 });
  const paint = job({ id: "paint", isDiy: true, amount: 90_000 });
  const proposal = job({ id: "prop", status: "pending_homeowner_approval", permitNumber: "BLD-9" });

  const closeouts: JobCloseout[] = [
    { jobId: "roof", permitStatus: "open", papers: waiver("roof").papers },
    { jobId: "deck", permitStatus: "expired", papers: [] },
    { jobId: "pool", permitStatus: "closed", papers: [] },
    { ...waiver("prop"), permitStatus: "open" },
  ];

  it("sorts permits by status, counting permit numbers with no status as unrecorded", () => {
    const r = closeoutReview([roof, fence, deck, pool, paint, proposal], closeouts);
    expect(r.openPermits.map((j) => j.id)).toEqual(["roof"]);
    expect(r.expiredPermits.map((j) => j.id)).toEqual(["deck"]);
    expect(r.closedPermits.map((j) => j.id)).toEqual(["pool"]);
    expect(r.unrecordedPermits).toEqual([]);
    const r2 = closeoutReview([roof], []);
    expect(r2.unrecordedPermits.map((j) => j.id)).toEqual(["roof"]);
  });

  it("lists larger contractor jobs with and without a waiver on file", () => {
    const r = closeoutReview([roof, fence, deck, pool, paint, proposal], closeouts);
    expect(r.withWaiver.map((j) => j.id)).toEqual(["roof"]);
    expect(r.missingWaiver.map((j) => j.id)).toEqual(["fence", "deck", "pool"]);
  });

  it("reads a job's status and papers", () => {
    const byId = new Map(closeouts.map((c) => [c.jobId, c]));
    expect(permitStatusOf("roof", byId)).toBe("open");
    expect(permitStatusOf("fence", byId)).toBeUndefined();
    expect(hasPaper("roof", "lienWaiver", byId)).toBe(true);
    expect(hasPaper("roof", "noticeOfCommencement", byId)).toBe(false);
  });
});
