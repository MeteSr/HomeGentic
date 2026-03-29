/**
 * Document ingestion service (1.2.3).
 *
 * Takes structured extractions produced by document parsing (e.g. Claude Vision —
 * 1.2.2) and manages a review-before-confirm draft workflow:
 *
 *   createDraft(extraction, existingJobs?) → JobDraft   (pending_review)
 *   updateDraft(id, edits)                → JobDraft   (user corrections)
 *   confirmDraft(id)                      → Job        (calls jobService.create)
 *   discardDraft(id)                      → void
 *   getDrafts(propertyId?)                → JobDraft[] (pending_review only)
 *   getDraft(id)                          → JobDraft | undefined
 */

import { jobService } from "./job";
import type { Job } from "./job";

// ─── Public types ─────────────────────────────────────────────────────────────

export type DocType =
  | "receipt"
  | "invoice"
  | "permit"
  | "inspection"
  | "warranty"
  | "unknown";

export interface ParsedDocExtraction {
  docType:        DocType;
  sourceFileName: string;
  propertyId:     string;
  serviceType?:   string;
  contractorName?: string;
  amountCents?:   number;
  date?:          string;          // YYYY-MM-DD
  description?:   string;
  permitNumber?:  string;
  warrantyMonths?: number;
  isDiy?:         boolean;
  confidence:     number;          // 0–1
}

export type DraftStatus = "pending_review" | "confirmed" | "discarded";

export interface JobDraft {
  id:             string;
  propertyId:     string;
  extraction:     ParsedDocExtraction;
  // Editable fields (user may correct before confirming)
  serviceType:    string;
  contractorName?: string;
  amountCents:    number;
  date:           string;
  description:    string;
  permitNumber?:  string;
  warrantyMonths?: number;
  isDiy:          boolean;
  status:         DraftStatus;
  isDuplicate:    boolean;
  createdAt:      number;
}

type DraftEditableFields = Pick<
  JobDraft,
  | "serviceType"
  | "contractorName"
  | "amountCents"
  | "date"
  | "description"
  | "permitNumber"
  | "warrantyMonths"
  | "isDiy"
>;

// ─── Mock draft store ─────────────────────────────────────────────────────────

const MOCK_DRAFTS: JobDraft[] = [];
let _counter = 0;

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function isDuplicate(
  propertyId: string,
  serviceType: string,
  date: string,
  existingJobs: Job[]
): boolean {
  // Check against confirmed job history
  const jobMatch = existingJobs.some(
    (j) =>
      j.propertyId  === propertyId &&
      j.serviceType === serviceType &&
      j.date        === date
  );
  if (jobMatch) return true;

  // Check against existing pending drafts in the store
  return MOCK_DRAFTS.some(
    (d) =>
      d.status      === "pending_review" &&
      d.propertyId  === propertyId &&
      d.serviceType === serviceType &&
      d.date        === date
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const docIngestionService = {
  /**
   * Build a JobDraft from a parsed document extraction.
   * Pass existing jobs for the property to enable duplicate detection.
   */
  createDraft(extraction: ParsedDocExtraction, existingJobs: Job[] = []): JobDraft {
    const serviceType   = extraction.serviceType ?? "Other";
    const date          = extraction.date ?? todayIso();
    const amountCents   = extraction.amountCents ?? 0;
    const description   = extraction.description
      ?? `${extraction.docType} – ${serviceType}`;
    const isDiy         = extraction.isDiy ?? false;

    const draft: JobDraft = {
      id:             `DRAFT_${++_counter}_${Date.now()}`,
      propertyId:     extraction.propertyId,
      extraction,
      serviceType,
      contractorName: extraction.contractorName,
      amountCents,
      date,
      description,
      permitNumber:   extraction.permitNumber,
      warrantyMonths: extraction.warrantyMonths,
      isDiy,
      status:         "pending_review",
      isDuplicate:    isDuplicate(extraction.propertyId, serviceType, date, existingJobs),
      createdAt:      Date.now(),
    };

    MOCK_DRAFTS.push(draft);
    return { ...draft };
  },

  /** Return all pending_review drafts, optionally filtered by propertyId. */
  getDrafts(propertyId?: string): JobDraft[] {
    return MOCK_DRAFTS
      .filter((d) =>
        d.status === "pending_review" &&
        (propertyId === undefined || d.propertyId === propertyId)
      )
      .map((d) => ({ ...d }));
  },

  /** Return a single draft by id, regardless of status. */
  getDraft(id: string): JobDraft | undefined {
    const d = MOCK_DRAFTS.find((d) => d.id === id);
    return d ? { ...d } : undefined;
  },

  /** Update editable fields on a pending_review draft. */
  updateDraft(id: string, updates: Partial<DraftEditableFields>): JobDraft {
    const idx = MOCK_DRAFTS.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("Draft not found");
    const draft = MOCK_DRAFTS[idx];
    if (draft.status === "confirmed")  throw new Error("Cannot update a confirmed draft");
    if (draft.status === "discarded")  throw new Error("Cannot update a discarded draft");
    MOCK_DRAFTS[idx] = { ...draft, ...updates };
    return { ...MOCK_DRAFTS[idx] };
  },

  /** Confirm the draft: call jobService.create() then mark as confirmed. */
  async confirmDraft(id: string): Promise<Job> {
    const idx = MOCK_DRAFTS.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("Draft not found");
    const draft = MOCK_DRAFTS[idx];
    if (draft.status === "confirmed") throw new Error("Draft already confirmed");
    if (draft.status === "discarded") throw new Error("Draft is discarded");

    const job = await jobService.create({
      propertyId:     draft.propertyId,
      serviceType:    draft.serviceType,
      contractorName: draft.contractorName,
      amount:         draft.amountCents,
      date:           draft.date,
      description:    draft.description,
      permitNumber:   draft.permitNumber,
      warrantyMonths: draft.warrantyMonths,
      isDiy:          draft.isDiy,
    });

    MOCK_DRAFTS[idx] = { ...draft, status: "confirmed" };
    return job;
  },

  /** Discard a draft. Idempotent if already discarded. */
  discardDraft(id: string): void {
    const idx = MOCK_DRAFTS.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("Draft not found");
    if (MOCK_DRAFTS[idx].status === "discarded") return;
    MOCK_DRAFTS[idx] = { ...MOCK_DRAFTS[idx], status: "discarded" };
  },

  /** Clear all drafts — used in tests and on logout. */
  reset(): void {
    MOCK_DRAFTS.length = 0;
    _counter = 0;
  },
};
