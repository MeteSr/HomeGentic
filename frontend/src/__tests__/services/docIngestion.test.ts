import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { docIngestionService } from "@/services/docIngestion";
import type { ParsedDocExtraction } from "@/services/docIngestion";
import * as jobModule from "@/services/job";
import type { Job } from "@/services/job";

// ─── Fixed time ───────────────────────────────────────────────────────────────

const TODAY = "2026-03-29";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));
  docIngestionService.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExtraction(overrides: Partial<ParsedDocExtraction> = {}): ParsedDocExtraction {
  return {
    docType:        "receipt",
    sourceFileName: "hvac-receipt.pdf",
    propertyId:     "prop1",
    serviceType:    "HVAC",
    contractorName: "Cool Air LLC",
    amountCents:    85_000,
    date:           "2024-06-15",
    description:    "Annual HVAC tune-up",
    confidence:     0.92,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "prop1",
    homeowner:        "principal1",
    serviceType:      "HVAC",
    amount:           85_000,
    date:             "2024-06-15",
    description:      "Annual HVAC tune-up",
    isDiy:            false,
    status:           "verified",
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    ...overrides,
  };
}

// ─── createDraft ──────────────────────────────────────────────────────────────

describe("docIngestionService.createDraft", () => {
  it("creates a draft with status pending_review", () => {
    const draft = docIngestionService.createDraft(makeExtraction());
    expect(draft.status).toBe("pending_review");
  });

  it("assigns a unique id", () => {
    const d1 = docIngestionService.createDraft(makeExtraction());
    const d2 = docIngestionService.createDraft(makeExtraction({ sourceFileName: "b.pdf" }));
    expect(d1.id).toBeTruthy();
    expect(d2.id).toBeTruthy();
    expect(d1.id).not.toBe(d2.id);
  });

  it("populates all fields from extraction", () => {
    const ext = makeExtraction();
    const draft = docIngestionService.createDraft(ext);
    expect(draft.propertyId).toBe("prop1");
    expect(draft.serviceType).toBe("HVAC");
    expect(draft.contractorName).toBe("Cool Air LLC");
    expect(draft.amountCents).toBe(85_000);
    expect(draft.date).toBe("2024-06-15");
    expect(draft.description).toBe("Annual HVAC tune-up");
    expect(draft.isDiy).toBe(false);
  });

  it("stores the original extraction on the draft", () => {
    const ext = makeExtraction();
    const draft = docIngestionService.createDraft(ext);
    expect(draft.extraction).toEqual(ext);
  });

  it("defaults amountCents to 0 when not in extraction", () => {
    const draft = docIngestionService.createDraft(makeExtraction({ amountCents: undefined }));
    expect(draft.amountCents).toBe(0);
  });

  it("defaults date to today when not in extraction", () => {
    const draft = docIngestionService.createDraft(makeExtraction({ date: undefined }));
    expect(draft.date).toBe(TODAY);
  });

  it("defaults isDiy to false when not in extraction", () => {
    const draft = docIngestionService.createDraft(makeExtraction({ isDiy: undefined }));
    expect(draft.isDiy).toBe(false);
  });

  it("defaults serviceType to 'Other' when not in extraction", () => {
    const draft = docIngestionService.createDraft(makeExtraction({ serviceType: undefined }));
    expect(draft.serviceType).toBe("Other");
  });

  it("generates a fallback description from docType + serviceType when missing", () => {
    const draft = docIngestionService.createDraft(
      makeExtraction({ description: undefined, docType: "invoice", serviceType: "Plumbing" })
    );
    expect(draft.description).toBe("invoice – Plumbing");
  });

  it("preserves permitNumber and warrantyMonths when present", () => {
    const draft = docIngestionService.createDraft(
      makeExtraction({ permitNumber: "P-2024-001", warrantyMonths: 12 })
    );
    expect(draft.permitNumber).toBe("P-2024-001");
    expect(draft.warrantyMonths).toBe(12);
  });

  // ── Duplicate detection ──

  it("isDuplicate = false when no existing jobs provided", () => {
    const draft = docIngestionService.createDraft(makeExtraction());
    expect(draft.isDuplicate).toBe(false);
  });

  it("isDuplicate = true when a job with same propertyId + serviceType + date exists", () => {
    const job = makeJob({ propertyId: "prop1", serviceType: "HVAC", date: "2024-06-15" });
    const draft = docIngestionService.createDraft(makeExtraction(), [job]);
    expect(draft.isDuplicate).toBe(true);
  });

  it("isDuplicate = false when same serviceType but different date", () => {
    const job = makeJob({ date: "2023-01-01" });
    const draft = docIngestionService.createDraft(
      makeExtraction({ date: "2024-06-15" }), [job]
    );
    expect(draft.isDuplicate).toBe(false);
  });

  it("isDuplicate = false when same date but different propertyId", () => {
    const job = makeJob({ propertyId: "other-prop" });
    const draft = docIngestionService.createDraft(
      makeExtraction({ propertyId: "prop1" }), [job]
    );
    expect(draft.isDuplicate).toBe(false);
  });

  it("isDuplicate = false when same date but different serviceType", () => {
    const job = makeJob({ serviceType: "Plumbing" });
    const draft = docIngestionService.createDraft(
      makeExtraction({ serviceType: "HVAC" }), [job]
    );
    expect(draft.isDuplicate).toBe(false);
  });

  it("isDuplicate = true when another pending draft has identical propertyId + serviceType + date", () => {
    docIngestionService.createDraft(makeExtraction({ propertyId: "prop1", serviceType: "HVAC", date: "2024-06-15" }));
    const second = docIngestionService.createDraft(makeExtraction({ propertyId: "prop1", serviceType: "HVAC", date: "2024-06-15" }));
    expect(second.isDuplicate).toBe(true);
  });

  it("sets createdAt to approximately now", () => {
    const before = Date.now();
    const draft = docIngestionService.createDraft(makeExtraction());
    expect(draft.createdAt).toBeGreaterThanOrEqual(before);
    expect(draft.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

// ─── getDrafts ────────────────────────────────────────────────────────────────

describe("docIngestionService.getDrafts", () => {
  it("returns empty array when no drafts exist", () => {
    expect(docIngestionService.getDrafts()).toHaveLength(0);
  });

  it("returns all pending_review drafts", () => {
    docIngestionService.createDraft(makeExtraction({ sourceFileName: "a.pdf" }));
    docIngestionService.createDraft(makeExtraction({ sourceFileName: "b.pdf" }));
    expect(docIngestionService.getDrafts()).toHaveLength(2);
  });

  it("filters by propertyId when provided", () => {
    docIngestionService.createDraft(makeExtraction({ propertyId: "p1" }));
    docIngestionService.createDraft(makeExtraction({ propertyId: "p2" }));
    expect(docIngestionService.getDrafts("p1")).toHaveLength(1);
    expect(docIngestionService.getDrafts("p1")[0].propertyId).toBe("p1");
  });

  it("excludes discarded drafts", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.discardDraft(d.id);
    expect(docIngestionService.getDrafts()).toHaveLength(0);
  });

  it("excludes confirmed drafts", async () => {
    vi.spyOn(jobModule.jobService, "create").mockResolvedValueOnce(makeJob());
    const d = docIngestionService.createDraft(makeExtraction());
    await docIngestionService.confirmDraft(d.id);
    expect(docIngestionService.getDrafts()).toHaveLength(0);
  });
});

// ─── getDraft ─────────────────────────────────────────────────────────────────

describe("docIngestionService.getDraft", () => {
  it("returns the draft by id", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    expect(docIngestionService.getDraft(d.id)?.id).toBe(d.id);
  });

  it("returns undefined for unknown id", () => {
    expect(docIngestionService.getDraft("no-such-id")).toBeUndefined();
  });
});

// ─── updateDraft ──────────────────────────────────────────────────────────────

describe("docIngestionService.updateDraft", () => {
  it("updates editable fields and returns updated draft", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    const updated = docIngestionService.updateDraft(d.id, {
      amountCents: 99_999,
      serviceType: "Plumbing",
      description: "corrected",
    });
    expect(updated.amountCents).toBe(99_999);
    expect(updated.serviceType).toBe("Plumbing");
    expect(updated.description).toBe("corrected");
  });

  it("partial updates leave other fields unchanged", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    const updated = docIngestionService.updateDraft(d.id, { amountCents: 1 });
    expect(updated.serviceType).toBe("HVAC");
    expect(updated.date).toBe("2024-06-15");
  });

  it("throws 'Draft not found' when id does not exist", () => {
    expect(() => docIngestionService.updateDraft("no-such-id", {})).toThrow("Draft not found");
  });

  it("throws when updating a confirmed draft", async () => {
    vi.spyOn(jobModule.jobService, "create").mockResolvedValueOnce(makeJob());
    const d = docIngestionService.createDraft(makeExtraction());
    await docIngestionService.confirmDraft(d.id);
    expect(() => docIngestionService.updateDraft(d.id, { amountCents: 1 }))
      .toThrow("Cannot update a confirmed draft");
  });

  it("throws when updating a discarded draft", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.discardDraft(d.id);
    expect(() => docIngestionService.updateDraft(d.id, { amountCents: 1 }))
      .toThrow("Cannot update a discarded draft");
  });
});

// ─── discardDraft ─────────────────────────────────────────────────────────────

describe("docIngestionService.discardDraft", () => {
  it("sets status to discarded", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.discardDraft(d.id);
    expect(docIngestionService.getDraft(d.id)?.status).toBe("discarded");
  });

  it("throws 'Draft not found' for unknown id", () => {
    expect(() => docIngestionService.discardDraft("no-such-id")).toThrow("Draft not found");
  });

  it("is idempotent — discarding an already-discarded draft does not throw", () => {
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.discardDraft(d.id);
    expect(() => docIngestionService.discardDraft(d.id)).not.toThrow();
  });
});

// ─── confirmDraft ─────────────────────────────────────────────────────────────

describe("docIngestionService.confirmDraft", () => {
  it("calls jobService.create with mapped fields and returns the created job", async () => {
    const mockJob = makeJob({ id: "created-j1" });
    const createSpy = vi.spyOn(jobModule.jobService, "create").mockResolvedValueOnce(mockJob);

    const d = docIngestionService.createDraft(makeExtraction());
    const job = await docIngestionService.confirmDraft(d.id);

    expect(job.id).toBe("created-j1");
    expect(createSpy).toHaveBeenCalledWith({
      propertyId:     "prop1",
      serviceType:    "HVAC",
      contractorName: "Cool Air LLC",
      amount:         85_000,
      date:           "2024-06-15",
      description:    "Annual HVAC tune-up",
      permitNumber:   undefined,
      warrantyMonths: undefined,
      isDiy:          false,
    });
  });

  it("marks the draft as confirmed after success", async () => {
    vi.spyOn(jobModule.jobService, "create").mockResolvedValueOnce(makeJob());
    const d = docIngestionService.createDraft(makeExtraction());
    await docIngestionService.confirmDraft(d.id);
    expect(docIngestionService.getDraft(d.id)?.status).toBe("confirmed");
  });

  it("uses updated fields if draft was edited before confirm", async () => {
    const createSpy = vi.spyOn(jobModule.jobService, "create").mockResolvedValueOnce(makeJob());
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.updateDraft(d.id, { amountCents: 99_000, description: "edited" });
    await docIngestionService.confirmDraft(d.id);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      amount: 99_000,
      description: "edited",
    }));
  });

  it("rejects with 'Draft not found' for unknown id", async () => {
    await expect(docIngestionService.confirmDraft("no-such-id")).rejects.toThrow("Draft not found");
  });

  it("rejects with 'Draft already confirmed' when called twice", async () => {
    vi.spyOn(jobModule.jobService, "create").mockResolvedValue(makeJob());
    const d = docIngestionService.createDraft(makeExtraction());
    await docIngestionService.confirmDraft(d.id);
    await expect(docIngestionService.confirmDraft(d.id)).rejects.toThrow("Draft already confirmed");
  });

  it("rejects with 'Draft is discarded' when draft was discarded", async () => {
    const d = docIngestionService.createDraft(makeExtraction());
    docIngestionService.discardDraft(d.id);
    await expect(docIngestionService.confirmDraft(d.id)).rejects.toThrow("Draft is discarded");
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe("docIngestionService.reset", () => {
  it("clears all drafts", () => {
    docIngestionService.createDraft(makeExtraction({ sourceFileName: "a.pdf" }));
    docIngestionService.createDraft(makeExtraction({ sourceFileName: "b.pdf" }));
    docIngestionService.reset();
    expect(docIngestionService.getDrafts()).toHaveLength(0);
  });
});
