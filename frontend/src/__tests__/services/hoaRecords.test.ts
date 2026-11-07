import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stateful stand-in for the property canister's #726 methods.
const reviews: any[] = [];
const assessments: any[] = [];
const condo = new Map<string, any>();
let n = 0;
const stamp = 1_700_000_000_000_000_000n;
const mockActor = {
  getArchitecturalReviews: vi.fn(async (pid: string) =>
    pid === "missing" ? { err: { NotFound: null } } : { ok: reviews.filter((r) => r.propertyId === pid) },
  ),
  addArchitecturalReview: vi.fn(async (pid: string, input: any) => {
    const r = { ...input, id: `r${++n}`, propertyId: pid, createdAt: stamp, updatedAt: stamp };
    reviews.unshift(r);
    return { ok: r };
  }),
  updateArchitecturalReview: vi.fn(async (id: string, input: any) => {
    const i = reviews.findIndex((r) => r.id === id);
    if (i < 0) return { err: { NotFound: null } };
    reviews[i] = { ...reviews[i], ...input };
    return { ok: reviews[i] };
  }),
  deleteArchitecturalReview: vi.fn(async (id: string) => {
    const i = reviews.findIndex((r) => r.id === id);
    if (i < 0) return { err: { NotFound: null } };
    reviews.splice(i, 1);
    return { ok: null };
  }),
  getSpecialAssessments: vi.fn(async (pid: string) => ({ ok: assessments.filter((a) => a.propertyId === pid) })),
  addSpecialAssessment: vi.fn(async (pid: string, input: any) => {
    const a = { ...input, id: `a${++n}`, propertyId: pid, createdAt: stamp, updatedAt: stamp };
    assessments.unshift(a);
    return { ok: a };
  }),
  updateSpecialAssessment: vi.fn(async (id: string, input: any) => {
    const i = assessments.findIndex((a) => a.id === id);
    assessments[i] = { ...assessments[i], ...input };
    return { ok: assessments[i] };
  }),
  deleteSpecialAssessment: vi.fn(async (id: string) => {
    assessments.splice(
      assessments.findIndex((a) => a.id === id),
      1,
    );
    return { ok: null };
  }),
  getCondoAssociationRecord: vi.fn(async (pid: string) => ({ ok: condo.has(pid) ? [condo.get(pid)] : [] })),
  setCondoAssociationRecord: vi.fn(async (pid: string, rec: any[]) => {
    if (pid === "house")
      return { err: { InvalidInput: "Milestone inspection and reserve study records are for condo homes" } };
    if (rec.length) condo.set(pid, { ...rec[0], updatedAt: stamp });
    else condo.delete(pid);
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  hoaService,
  validateReview,
  validateAssessment,
  validateCondo,
  assessmentTotals,
  dueStatus,
  EMPTY_REVIEW,
  EMPTY_CONDO,
  type ReviewRequest,
  type Assessment,
  type CondoRecord,
} from "@/services/hoaRecords";

const REVIEW: ReviewRequest = {
  ...EMPTY_REVIEW,
  project: "Replace the back fence",
  submittedDate: "2026-03-02",
  status: "Submitted",
};
const ASSESSMENT: Assessment = {
  title: "Roof replacement",
  amount: 4500,
  dueDate: "2026-09-01",
  paidDate: "",
  notes: "",
  documentId: null,
};
const CONDO: CondoRecord = {
  ...EMPTY_CONDO,
  associationName: "Bayview Towers",
  milestoneLastDate: "2024-12-15",
  milestoneNextDue: "2034-12-15",
  milestoneDocId: "doc1",
};

beforeEach(() => {
  reviews.length = 0;
  assessments.length = 0;
  condo.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_hoa;
});

describe("hoaService review requests", () => {
  it("adds, updates, lists and deletes in canister shapes", async () => {
    const added = await hoaService.addReview("p1", { ...REVIEW, jobId: "job-1" });
    expect(mockActor.addArchitecturalReview).toHaveBeenCalledWith("p1", {
      project: "Replace the back fence",
      details: "",
      submittedDate: "2026-03-02",
      status: { Submitted: null },
      decisionDate: "",
      conditions: "",
      approvalDocId: [],
      jobId: ["job-1"],
    });
    expect(added).toMatchObject({
      id: "r1",
      status: "Submitted",
      jobId: "job-1",
      approvalDocId: null,
      createdAt: 1_700_000_000_000,
    });

    const decided = await hoaService.updateReview("r1", {
      ...REVIEW,
      status: "ApprovedWithConditions",
      decisionDate: "2026-03-20",
      approvalDocId: "doc-9",
    });
    expect(decided).toMatchObject({ status: "ApprovedWithConditions", approvalDocId: "doc-9" });
    expect(await hoaService.listReviews("p1")).toHaveLength(1);
    await hoaService.deleteReview("r1");
    expect(await hoaService.listReviews("p1")).toEqual([]);
    await expect(hoaService.deleteReview("r1")).rejects.toMatchObject({ code: "NotFound" });
    await expect(hoaService.listReviews("missing")).rejects.toMatchObject({ code: "NotFound" });
  });
});

describe("hoaService special assessments", () => {
  it("stores amounts in cents and reads them back in dollars", async () => {
    const a = await hoaService.addAssessment("p1", { ...ASSESSMENT, documentId: "doc-2" });
    expect(mockActor.addSpecialAssessment).toHaveBeenCalledWith("p1", {
      title: "Roof replacement",
      amountCents: 450_000n,
      dueDate: "2026-09-01",
      paidDate: "",
      notes: "",
      documentId: ["doc-2"],
    });
    expect(a).toMatchObject({ id: expect.any(String), amount: 4500, documentId: "doc-2" });
    const paid = await hoaService.updateAssessment(a.id!, { ...ASSESSMENT, paidDate: "2026-08-20" });
    expect(paid.paidDate).toBe("2026-08-20");
    expect((await hoaService.listAssessments("p1"))[0].amount).toBe(4500);
    await hoaService.deleteAssessment(a.id!);
    expect(await hoaService.listAssessments("p1")).toEqual([]);
  });
});

describe("hoaService condo record", () => {
  it("saves, reads and clears it; refuses non-condo homes", async () => {
    expect(await hoaService.getCondo("p1")).toBeNull();
    await hoaService.saveCondo("p1", CONDO);
    expect(mockActor.setCondoAssociationRecord.mock.calls[0][1][0]).toMatchObject({
      milestoneDocId: ["doc1"],
      reserveStudyDocId: [],
    });
    expect(await hoaService.getCondo("p1")).toEqual({ ...CONDO, updatedAt: 1_700_000_000_000 });
    await hoaService.saveCondo("p1", null);
    expect(await hoaService.getCondo("p1")).toBeNull();
    await expect(hoaService.saveCondo("house", CONDO)).rejects.toMatchObject({ code: "InvalidInput" });
  });
});

describe("hoaService with e2e stand-ins", () => {
  it("keeps everything in window.__e2e_hoa", async () => {
    (window as any).__e2e_hoa = {};
    const r = await hoaService.addReview("p1", REVIEW);
    await hoaService.updateReview(r.id!, { ...REVIEW, status: "Approved", decisionDate: "2026-03-09" });
    expect((await hoaService.listReviews("p1"))[0].status).toBe("Approved");
    const a = await hoaService.addAssessment("p1", ASSESSMENT);
    await hoaService.updateAssessment(a.id!, { ...ASSESSMENT, amount: 10 });
    expect((await hoaService.listAssessments("p1"))[0].amount).toBe(10);
    await hoaService.deleteAssessment(a.id!);
    await hoaService.deleteReview(r.id!);
    expect(await hoaService.listReviews("p1")).toEqual([]);
    expect(await hoaService.listAssessments("p1")).toEqual([]);
    await hoaService.saveCondo("p1", CONDO);
    expect(await hoaService.getCondo("p1")).toEqual(CONDO);
    await hoaService.saveCondo("p1", null);
    expect(await hoaService.getCondo("p1")).toBeNull();
    expect(mockActor.addArchitecturalReview).not.toHaveBeenCalled();
  });
});

describe("validation", () => {
  it("checks review requests like the canister", () => {
    expect(validateReview(REVIEW)).toBeNull();
    expect(validateReview({ ...REVIEW, status: "Planned", submittedDate: "" })).toBeNull();
    expect(validateReview({ ...REVIEW, project: " " })).toMatch(/what the request is for/);
    expect(validateReview({ ...REVIEW, project: "x".repeat(121) })).toMatch(/120/);
    expect(validateReview({ ...REVIEW, submittedDate: "" })).toMatch(/submitted/);
    expect(validateReview({ ...REVIEW, status: "Approved" })).toMatch(/decision/);
    expect(validateReview({ ...REVIEW, status: "Denied", decisionDate: "2026-02-30" })).toMatch(/Decision date/);
    expect(validateReview({ ...REVIEW, status: "Approved", decisionDate: "2026-03-01" })).toMatch(/before/);
    expect(validateReview({ ...REVIEW, details: "x".repeat(2001) })).toMatch(/2,000/);
    expect(validateReview({ ...REVIEW, conditions: "x".repeat(1001) })).toMatch(/1,000/);
  });

  it("checks assessments like the canister", () => {
    expect(validateAssessment(ASSESSMENT)).toBeNull();
    expect(validateAssessment({ ...ASSESSMENT, title: "" })).toMatch(/what the assessment/);
    expect(validateAssessment({ ...ASSESSMENT, amount: 0 })).toMatch(/amount/);
    expect(validateAssessment({ ...ASSESSMENT, amount: NaN })).toMatch(/amount/);
    expect(validateAssessment({ ...ASSESSMENT, amount: 100_000_001 })).toMatch(/100,000,000/);
    expect(validateAssessment({ ...ASSESSMENT, dueDate: "" })).toMatch(/Due date/);
    expect(validateAssessment({ ...ASSESSMENT, paidDate: "2026-02-31" })).toMatch(/Paid date/);
    expect(validateAssessment({ ...ASSESSMENT, notes: "x".repeat(1001) })).toMatch(/1,000/);
  });

  it("checks the condo record like the canister", () => {
    expect(validateCondo(CONDO)).toBeNull();
    expect(validateCondo(EMPTY_CONDO)).toBeNull();
    expect(validateCondo({ ...CONDO, associationName: "x".repeat(121) })).toMatch(/120/);
    expect(validateCondo({ ...CONDO, milestoneNextDue: "2034-02-30" })).toMatch(/milestone/i);
    expect(validateCondo({ ...CONDO, reserveStudyLastDate: "June" })).toMatch(/reserve study/i);
    expect(validateCondo({ ...CONDO, notes: "x".repeat(2001) })).toMatch(/2,000/);
  });
});

describe("assessmentTotals and dueStatus", () => {
  it("adds up what is still owed and what was paid", () => {
    expect(
      assessmentTotals([
        { ...ASSESSMENT, amount: 4500 },
        { ...ASSESSMENT, amount: 1200.5, paidDate: "2026-01-02" },
        { ...ASSESSMENT, amount: 300 },
      ]),
    ).toEqual({ unpaid: 4800, paid: 1200.5 });
  });

  it("says how far off a date is", () => {
    const NOW = Date.UTC(2026, 10, 7, 12);
    expect(dueStatus("2026-11-01", NOW)).toBe("overdue");
    expect(dueStatus("2027-11-07", NOW)).toBe("soon");
    expect(dueStatus("2027-11-08", NOW)).toBe("later");
    expect(dueStatus("", NOW)).toBeNull();
  });
});
