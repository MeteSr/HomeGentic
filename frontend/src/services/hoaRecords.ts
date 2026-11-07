/**
 * #726: condo and HOA paperwork the household keeps on the property canister:
 * architectural review requests, special assessments (dated costs) and, for
 * condos, what the owner knows of the association's milestone inspection and
 * structural reserve study. HomeGentic records what the owner enters; it
 * doesn't check anything with the association or say whether a building is safe.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export const REVIEW_STATUSES = [
  "Planned",
  "Submitted",
  "Approved",
  "ApprovedWithConditions",
  "Denied",
  "Withdrawn",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  Planned: "Not sent yet",
  Submitted: "Waiting for a decision",
  Approved: "Approved",
  ApprovedWithConditions: "Approved with conditions",
  Denied: "Denied",
  Withdrawn: "Withdrawn",
};

export interface ReviewRequest {
  id?: string;
  project: string;
  details: string;
  /** "YYYY-MM-DD" or "". */
  submittedDate: string;
  status: ReviewStatus;
  decisionDate: string;
  conditions: string;
  /** The approval letter, a document in the home's vault. */
  approvalDocId: string | null;
  /** The job for the approved work. */
  jobId: string | null;
  createdAt?: number;
}

export interface Assessment {
  id?: string;
  title: string;
  /** Whole dollars and cents, e.g. 4500.5. */
  amount: number;
  dueDate: string;
  /** "" while unpaid. */
  paidDate: string;
  notes: string;
  documentId: string | null;
}

export interface CondoRecord {
  associationName: string;
  milestoneLastDate: string;
  milestoneNextDue: string;
  milestoneDocId: string | null;
  reserveStudyLastDate: string;
  reserveStudyNextDue: string;
  reserveStudyDocId: string | null;
  notes: string;
  updatedAt?: number;
}

export const EMPTY_REVIEW: ReviewRequest = {
  project: "",
  details: "",
  submittedDate: "",
  status: "Planned",
  decisionDate: "",
  conditions: "",
  approvalDocId: null,
  jobId: null,
};

export const EMPTY_CONDO: CondoRecord = {
  associationName: "",
  milestoneLastDate: "",
  milestoneNextDue: "",
  milestoneDocId: null,
  reserveStudyLastDate: "",
  reserveStudyNextDue: "",
  reserveStudyDocId: null,
  notes: "",
};

const MAX_DOLLARS = 100_000_000;
const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);
const opt = (v: string | null): [] | [string] => (v ? [v] : []);
const unopt = (v: [] | [string]): string | null => (v.length ? v[0] : null);

function reviewIn(r: ReviewRequest): PropertyTypes.ReviewInput {
  return {
    project: r.project,
    details: r.details,
    submittedDate: r.submittedDate,
    status: { [r.status]: null } as PropertyTypes.ReviewStatus,
    decisionDate: r.decisionDate,
    conditions: r.conditions,
    approvalDocId: opt(r.approvalDocId),
    jobId: opt(r.jobId),
  };
}

function reviewOut(raw: PropertyTypes.ArchitecturalReview): ReviewRequest {
  return {
    id: raw.id,
    project: raw.project,
    details: raw.details,
    submittedDate: raw.submittedDate,
    status: Object.keys(raw.status)[0] as ReviewStatus,
    decisionDate: raw.decisionDate,
    conditions: raw.conditions,
    approvalDocId: unopt(raw.approvalDocId),
    jobId: unopt(raw.jobId),
    createdAt: nsToMs(raw.createdAt),
  };
}

function assessmentIn(a: Assessment): PropertyTypes.AssessmentInput {
  return {
    title: a.title,
    amountCents: BigInt(Math.round(a.amount * 100)),
    dueDate: a.dueDate,
    paidDate: a.paidDate,
    notes: a.notes,
    documentId: opt(a.documentId),
  };
}

function assessmentOut(raw: PropertyTypes.SpecialAssessment): Assessment {
  return {
    id: raw.id,
    title: raw.title,
    amount: Number(raw.amountCents) / 100,
    dueDate: raw.dueDate,
    paidDate: raw.paidDate,
    notes: raw.notes,
    documentId: unopt(raw.documentId),
  };
}

function condoIn(c: CondoRecord): PropertyTypes.CondoRecordInput {
  return {
    associationName: c.associationName,
    milestoneLastDate: c.milestoneLastDate,
    milestoneNextDue: c.milestoneNextDue,
    milestoneDocId: opt(c.milestoneDocId),
    reserveStudyLastDate: c.reserveStudyLastDate,
    reserveStudyNextDue: c.reserveStudyNextDue,
    reserveStudyDocId: opt(c.reserveStudyDocId),
    notes: c.notes,
  };
}

function condoOut(raw: PropertyTypes.CondoRecord): CondoRecord {
  return {
    associationName: raw.associationName,
    milestoneLastDate: raw.milestoneLastDate,
    milestoneNextDue: raw.milestoneNextDue,
    milestoneDocId: unopt(raw.milestoneDocId),
    reserveStudyLastDate: raw.reserveStudyLastDate,
    reserveStudyNextDue: raw.reserveStudyNextDue,
    reserveStudyDocId: unopt(raw.reserveStudyDocId),
    notes: raw.notes,
    updatedAt: nsToMs(raw.updatedAt),
  };
}

// ─── E2E stand-in: window.__e2e_hoa = { reviews?, assessments?, condo? } ────

interface E2EHoa {
  reviews?: Array<ReviewRequest & { propertyId: string }>;
  assessments?: Array<Assessment & { propertyId: string }>;
  condo?: Record<string, CondoRecord>;
}
function e2e(): E2EHoa | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_hoa : undefined;
}
const e2eId = () => `e2e-${Math.random().toString(36).slice(2, 10)}`;
const strip = <T extends { propertyId: string }>({ propertyId: _p, ...rest }: T) => rest;

function unwrap<T>(res: { ok: T } | { err: PropertyTypes.Error }): T {
  if ("err" in res) throw canisterError(res.err);
  return res.ok;
}

export const hoaService = {
  async listReviews(propertyId: string): Promise<ReviewRequest[]> {
    const m = e2e();
    if (m) return (m.reviews ?? []).filter((r) => r.propertyId === propertyId).map(strip);
    return unwrap(await (await getActor()).getArchitecturalReviews(propertyId)).map(reviewOut);
  },
  async addReview(propertyId: string, r: ReviewRequest): Promise<ReviewRequest> {
    const m = e2e();
    if (m) {
      const rec = { ...r, id: e2eId(), propertyId, createdAt: Date.now() };
      (m.reviews ??= []).unshift(rec);
      return strip(rec);
    }
    return reviewOut(unwrap(await (await getActor()).addArchitecturalReview(propertyId, reviewIn(r))));
  },
  async updateReview(id: string, r: ReviewRequest): Promise<ReviewRequest> {
    const m = e2e();
    if (m) {
      const list = m.reviews ?? [];
      const i = list.findIndex((x) => x.id === id);
      list[i] = { ...list[i], ...r, id };
      return strip(list[i]);
    }
    return reviewOut(unwrap(await (await getActor()).updateArchitecturalReview(id, reviewIn(r))));
  },
  async deleteReview(id: string): Promise<void> {
    const m = e2e();
    if (m) {
      m.reviews = (m.reviews ?? []).filter((x) => x.id !== id);
      return;
    }
    unwrap(await (await getActor()).deleteArchitecturalReview(id));
  },

  async listAssessments(propertyId: string): Promise<Assessment[]> {
    const m = e2e();
    if (m) return (m.assessments ?? []).filter((a) => a.propertyId === propertyId).map(strip);
    return unwrap(await (await getActor()).getSpecialAssessments(propertyId)).map(assessmentOut);
  },
  async addAssessment(propertyId: string, a: Assessment): Promise<Assessment> {
    const m = e2e();
    if (m) {
      const rec = { ...a, id: e2eId(), propertyId };
      (m.assessments ??= []).unshift(rec);
      return strip(rec);
    }
    return assessmentOut(unwrap(await (await getActor()).addSpecialAssessment(propertyId, assessmentIn(a))));
  },
  async updateAssessment(id: string, a: Assessment): Promise<Assessment> {
    const m = e2e();
    if (m) {
      const list = m.assessments ?? [];
      const i = list.findIndex((x) => x.id === id);
      list[i] = { ...list[i], ...a, id };
      return strip(list[i]);
    }
    return assessmentOut(unwrap(await (await getActor()).updateSpecialAssessment(id, assessmentIn(a))));
  },
  async deleteAssessment(id: string): Promise<void> {
    const m = e2e();
    if (m) {
      m.assessments = (m.assessments ?? []).filter((x) => x.id !== id);
      return;
    }
    unwrap(await (await getActor()).deleteSpecialAssessment(id));
  },

  async getCondo(propertyId: string): Promise<CondoRecord | null> {
    const m = e2e();
    if (m) return m.condo?.[propertyId] ?? null;
    const res = unwrap(await (await getActor()).getCondoAssociationRecord(propertyId));
    return res.length ? condoOut(res[0]) : null;
  },
  /** Save the condo association record, or clear it with null. */
  async saveCondo(propertyId: string, c: CondoRecord | null): Promise<void> {
    const m = e2e();
    if (m) {
      m.condo ??= {};
      if (c) m.condo[propertyId] = c;
      else delete m.condo[propertyId];
      return;
    }
    unwrap(await (await getActor()).setCondoAssociationRecord(propertyId, c ? [condoIn(c)] : []));
  },
};

// ─── Validation (mirrors backend/property/Hoa.mo) ───────────────────────────

/** "" or a real date from 1950 to 2100. */
function okDate(d: string): boolean {
  if (d === "") return true;
  const y = Number(d.slice(0, 4));
  return isoDateMs(d) !== null && y >= 1950 && y <= 2100;
}

export function validateReview(r: ReviewRequest): string | null {
  const project = r.project.trim();
  if (project === "") return "Say what the request is for";
  if (project.length > 120) return "Project is over 120 characters";
  if (r.details.trim().length > 2000) return "Details are over 2,000 characters";
  if (r.conditions.trim().length > 1000) return "Conditions are over 1,000 characters";
  if (!okDate(r.submittedDate)) return "Submitted date must be a real date";
  if (!okDate(r.decisionDate)) return "Decision date must be a real date";
  const sent = r.status !== "Planned" && r.status !== "Withdrawn";
  const decided = r.status === "Approved" || r.status === "ApprovedWithConditions" || r.status === "Denied";
  if (sent && r.submittedDate === "") return "Enter the date you submitted the request";
  if (decided && r.decisionDate === "") return "Enter the date of the association's decision";
  if (r.submittedDate && r.decisionDate && r.decisionDate < r.submittedDate)
    return "The decision date is before the submitted date";
  return null;
}

export function validateAssessment(a: Assessment): string | null {
  const title = a.title.trim();
  if (title === "") return "Say what the assessment is for";
  if (title.length > 120) return "Title is over 120 characters";
  if (!(a.amount > 0)) return "Enter the amount";
  if (a.amount > MAX_DOLLARS) return "Amount is over $100,000,000";
  if (a.dueDate === "" || !okDate(a.dueDate)) return "Due date must be a real date";
  if (!okDate(a.paidDate)) return "Paid date must be a real date";
  if (a.notes.trim().length > 1000) return "Notes are over 1,000 characters";
  return null;
}

export function validateCondo(c: CondoRecord): string | null {
  if (c.associationName.trim().length > 120) return "Association name is over 120 characters";
  if (!okDate(c.milestoneLastDate)) return "Milestone inspection date must be a real date";
  if (!okDate(c.milestoneNextDue)) return "Next milestone inspection date must be a real date";
  if (!okDate(c.reserveStudyLastDate)) return "Reserve study date must be a real date";
  if (!okDate(c.reserveStudyNextDue)) return "Next reserve study date must be a real date";
  if (c.notes.trim().length > 2000) return "Notes are over 2,000 characters";
  return null;
}

/** What is still owed and what was paid, in dollars. */
export function assessmentTotals(list: Assessment[]): { unpaid: number; paid: number } {
  let unpaid = 0;
  let paid = 0;
  for (const a of list) {
    if (a.paidDate) paid += a.amount;
    else unpaid += a.amount;
  }
  return { unpaid, paid };
}

/** How far off a date is: passed, within a year, or later. Null for "" or a bad date. */
export function dueStatus(date: string, nowMs: number): "overdue" | "soon" | "later" | null {
  const due = isoDateMs(date);
  if (due === null) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (due < today) return "overdue";
  const yearOut = Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate());
  return due <= yearOut ? "soon" : "later";
}
