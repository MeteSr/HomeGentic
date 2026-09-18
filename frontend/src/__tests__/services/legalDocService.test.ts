/**
 * legalDocService — real logic worth locking down:
 *   - getTemplates returns universal templates plus only the requested
 *     state's specific templates
 *   - logUpload records an upload with an incrementing id
 *   - getUploads scopes to only the given property
 *   - __reset clears all uploads and the id counter
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTemplates, legalDocService } from "@/services/legalDocService";

describe("getTemplates", () => {
  it("returns only universal templates for an unlisted state", () => {
    const templates = getTemplates("WY");
    expect(templates.every((t) => t.state === "All")).toBe(true);
    expect(templates.length).toBe(4);
  });

  it("includes the state-specific template plus universal templates for FL", () => {
    const templates = getTemplates("FL");
    expect(templates.some((t) => t.id === "t-fl-pa")).toBe(true);
    expect(templates.length).toBe(5);
  });
});

describe("legalDocService", () => {
  beforeEach(() => legalDocService.__reset());

  it("logUpload records an upload with an incrementing id", () => {
    const a = legalDocService.logUpload("prop-1", "PurchaseAgreement", "contract.pdf");
    const b = legalDocService.logUpload("prop-1", "SellerDisclosure", "disclosure.pdf");
    expect(a.id).toBe("ldoc-1");
    expect(b.id).toBe("ldoc-2");
  });

  it("getUploads scopes to only the given property", () => {
    legalDocService.logUpload("prop-1", "PurchaseAgreement", "a.pdf");
    legalDocService.logUpload("prop-2", "PurchaseAgreement", "b.pdf");
    expect(legalDocService.getUploads("prop-1")).toHaveLength(1);
    expect(legalDocService.getUploads("prop-1")[0].filename).toBe("a.pdf");
  });

  it("__reset clears uploads and resets the id counter", () => {
    legalDocService.logUpload("prop-1", "PurchaseAgreement", "a.pdf");
    legalDocService.__reset();
    expect(legalDocService.getUploads("prop-1")).toEqual([]);
    const doc = legalDocService.logUpload("prop-1", "PurchaseAgreement", "b.pdf");
    expect(doc.id).toBe("ldoc-1");
  });
});
