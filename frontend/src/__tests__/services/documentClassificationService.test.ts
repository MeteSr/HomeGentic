/**
 * documentClassificationService — real logic worth locking down against the
 * mock classifier fallback (fetch fails in test env → mockClassify runs):
 *   - filename keywords drive documentType and suggestedServiceType
 *   - an unrecognized filename with an image mime falls back to "photo"
 *   - classifyBatch classifies every file and getHistory accumulates results
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createDocumentClassificationService } from "@/services/documentClassificationService";

function makeFile(name: string, type = "application/pdf"): File {
  return new File(["x"], name, { type });
}

describe("documentClassificationService.classifyDocument — mock fallback", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("classifies a receipt from the filename", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    const result = await service.classifyDocument(makeFile("hvac_receipt.pdf"));
    expect(result.documentType).toBe("receipt");
    expect(result.suggestedServiceType).toBe("HVAC");
  });

  it("classifies a permit document", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    const result = await service.classifyDocument(makeFile("roofing_permit.pdf"));
    expect(result.documentType).toBe("permit");
    expect(result.suggestedServiceType).toBe("Roofing");
  });

  it("falls back to 'photo' for an unrecognized image filename", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    const result = await service.classifyDocument(makeFile("IMG_0001.jpg", "image/jpeg"));
    expect(result.documentType).toBe("photo");
  });

  it("classifies as 'unknown' for a non-image file with no matching keywords", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    const result = await service.classifyDocument(makeFile("document.pdf"));
    expect(result.documentType).toBe("unknown");
  });
});

describe("documentClassificationService.classifyBatch / getHistory", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("classifies every file in the batch and accumulates history", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    const results = await service.classifyBatch([makeFile("hvac_receipt.pdf"), makeFile("roofing_permit.pdf")]);
    expect(results).toHaveLength(2);
    expect(service.getHistory()).toHaveLength(2);
  });

  it("getHistory returns a copy, not the internal array reference", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const service = createDocumentClassificationService();
    await service.classifyDocument(makeFile("hvac_receipt.pdf"));
    const history = service.getHistory();
    history.push({} as any);
    expect(service.getHistory()).toHaveLength(1);
  });
});
