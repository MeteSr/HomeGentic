/**
 * TDD — 1.2.2: Claude-powered Document Classification
 *
 * documentClassificationService sends files (as base64) to POST /api/classify
 * on the voice agent proxy. Claude Vision classifies type, extracts metadata.
 * Falls back to rule-based mock when agent is offline.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createDocumentClassificationService,
  type ClassificationResult,
  DOCUMENT_TYPES,
} from "@/services/documentClassificationService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name: string, type = "image/jpeg", content = "fake"): File {
  return new File([content], name, { type });
}

function makePdf(name = "permit.pdf"): File {
  return new File(["fake-pdf-bytes"], name, { type: "application/pdf" });
}

// ── DOCUMENT_TYPES constant ───────────────────────────────────────────────────

describe("DOCUMENT_TYPES (1.2.2)", () => {
  it("includes receipt, inspection_report, permit, warranty, invoice", () => {
    expect(DOCUMENT_TYPES).toContain("receipt");
    expect(DOCUMENT_TYPES).toContain("inspection_report");
    expect(DOCUMENT_TYPES).toContain("permit");
    expect(DOCUMENT_TYPES).toContain("warranty");
    expect(DOCUMENT_TYPES).toContain("invoice");
  });

  it("includes insurance, contract, photo, unknown", () => {
    expect(DOCUMENT_TYPES).toContain("insurance");
    expect(DOCUMENT_TYPES).toContain("contract");
    expect(DOCUMENT_TYPES).toContain("photo");
    expect(DOCUMENT_TYPES).toContain("unknown");
  });
});

// ── classifyDocument — result shape ──────────────────────────────────────────

describe("documentClassificationService.classifyDocument — shape (1.2.2)", () => {
  let svc: ReturnType<typeof createDocumentClassificationService>;
  beforeEach(() => { svc = createDocumentClassificationService(); });

  it("returns a ClassificationResult object", async () => {
    const r = await svc.classifyDocument(makeFile("receipt.jpg"));
    expect(r).toBeDefined();
    expect(typeof r).toBe("object");
  });

  it("result has documentType from DOCUMENT_TYPES", async () => {
    const r = await svc.classifyDocument(makeFile("doc.jpg"));
    expect(DOCUMENT_TYPES).toContain(r.documentType);
  });

  it("result has confidence: high | medium | low", async () => {
    const r = await svc.classifyDocument(makeFile("doc.jpg"));
    expect(["high", "medium", "low"]).toContain(r.confidence);
  });

  it("result has a non-empty description string", async () => {
    const r = await svc.classifyDocument(makeFile("doc.jpg"));
    expect(typeof r.description).toBe("string");
    expect(r.description.length).toBeGreaterThan(0);
  });

  it("result has rawFileName matching the input file name", async () => {
    const r = await svc.classifyDocument(makeFile("my-receipt.jpg"));
    expect(r.rawFileName).toBe("my-receipt.jpg");
  });
});

// ── Rule-based mock classification ───────────────────────────────────────────

describe("documentClassificationService — mock classification rules (1.2.2)", () => {
  let svc: ReturnType<typeof createDocumentClassificationService>;
  beforeEach(() => { svc = createDocumentClassificationService(); });

  it("classifies 'receipt' files as receipt", async () => {
    const r = await svc.classifyDocument(makeFile("home-depot-receipt.jpg"));
    expect(r.documentType).toBe("receipt");
  });

  it("classifies 'permit' files as permit", async () => {
    const r = await svc.classifyDocument(makeFile("building_permit_2024.pdf"));
    expect(r.documentType).toBe("permit");
  });

  it("classifies 'inspection' files as inspection_report", async () => {
    const r = await svc.classifyDocument(makeFile("home_inspection_report.pdf"));
    expect(r.documentType).toBe("inspection_report");
  });

  it("classifies 'warranty' files as warranty", async () => {
    const r = await svc.classifyDocument(makeFile("hvac_warranty.pdf"));
    expect(r.documentType).toBe("warranty");
  });

  it("classifies 'invoice' files as invoice", async () => {
    const r = await svc.classifyDocument(makeFile("contractor_invoice_final.pdf"));
    expect(r.documentType).toBe("invoice");
  });

  it("classifies 'insurance' files as insurance", async () => {
    const r = await svc.classifyDocument(makeFile("homeowners_insurance_policy.pdf"));
    expect(r.documentType).toBe("insurance");
  });

  it("classifies image/jpeg with generic name as photo", async () => {
    const r = await svc.classifyDocument(makeFile("IMG_4521.jpg", "image/jpeg"));
    expect(r.documentType).toBe("photo");
  });

  it("classifies image/png with generic name as photo", async () => {
    const r = await svc.classifyDocument(makeFile("screenshot.png", "image/png"));
    expect(r.documentType).toBe("photo");
  });

  it("classifies unrecognised PDF as unknown", async () => {
    const r = await svc.classifyDocument(makePdf("random_document_xyz.pdf"));
    expect(r.documentType).toBe("unknown");
  });

  it("classifies 'contract' files as contract", async () => {
    const r = await svc.classifyDocument(makeFile("contractor_contract_signed.pdf"));
    expect(r.documentType).toBe("contract");
  });
});

// ── suggestedServiceType ──────────────────────────────────────────────────────

describe("documentClassificationService — suggestedServiceType (1.2.2)", () => {
  let svc: ReturnType<typeof createDocumentClassificationService>;
  beforeEach(() => { svc = createDocumentClassificationService(); });

  it("suggests HVAC for files containing 'hvac'", async () => {
    const r = await svc.classifyDocument(makeFile("hvac_receipt.jpg"));
    expect(r.suggestedServiceType).toBe("HVAC");
  });

  it("suggests Roofing for files containing 'roof'", async () => {
    const r = await svc.classifyDocument(makeFile("roof_inspection.pdf"));
    expect(r.suggestedServiceType).toBe("Roofing");
  });

  it("suggests Plumbing for files containing 'plumb'", async () => {
    const r = await svc.classifyDocument(makeFile("plumbing_invoice.pdf"));
    expect(r.suggestedServiceType).toBe("Plumbing");
  });

  it("suggests Electrical for files containing 'electric'", async () => {
    const r = await svc.classifyDocument(makeFile("electrical_permit.pdf"));
    expect(r.suggestedServiceType).toBe("Electrical");
  });

  it("returns undefined suggestedServiceType for unrecognised file", async () => {
    const r = await svc.classifyDocument(makeFile("random_document_xyz.pdf"));
    expect(r.suggestedServiceType).toBeUndefined();
  });
});

// ── classifyBatch ─────────────────────────────────────────────────────────────

describe("documentClassificationService.classifyBatch (1.2.2)", () => {
  let svc: ReturnType<typeof createDocumentClassificationService>;
  beforeEach(() => { svc = createDocumentClassificationService(); });

  it("returns one result per file", async () => {
    const files = [
      makeFile("receipt.jpg"),
      makeFile("permit.pdf"),
      makeFile("warranty.pdf"),
    ];
    const results = await svc.classifyBatch(files);
    expect(results).toHaveLength(3);
  });

  it("each result has the correct rawFileName", async () => {
    const files = [makeFile("a.jpg"), makeFile("b.pdf")];
    const [r1, r2] = await svc.classifyBatch(files);
    expect(r1.rawFileName).toBe("a.jpg");
    expect(r2.rawFileName).toBe("b.pdf");
  });

  it("returns empty array for empty input", async () => {
    expect(await svc.classifyBatch([])).toHaveLength(0);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe("documentClassificationService.getHistory (1.2.2)", () => {
  let svc: ReturnType<typeof createDocumentClassificationService>;
  beforeEach(() => { svc = createDocumentClassificationService(); });

  it("returns empty array before any classification", () => {
    expect(svc.getHistory()).toHaveLength(0);
  });

  it("records each classified document in history", async () => {
    await svc.classifyDocument(makeFile("receipt.jpg"));
    await svc.classifyDocument(makeFile("permit.pdf"));
    expect(svc.getHistory()).toHaveLength(2);
  });

  it("getHistory returns a copy — mutations don't affect state", async () => {
    await svc.classifyDocument(makeFile("doc.jpg"));
    const h = svc.getHistory();
    h.push({} as ClassificationResult);
    expect(svc.getHistory()).toHaveLength(1);
  });
});
