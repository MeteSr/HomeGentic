/**
 * @jest-environment node
 *
 * TDD — Issue #51: documentService (mobile)
 */

import { documentTypeLabel, extractDocument, type DocumentType } from "../../services/documentService";

describe("documentTypeLabel", () => {
  const cases: Array<[DocumentType, string]> = [
    ["appliance_manual", "Appliance Manual"],
    ["warranty",         "Warranty Card"],
    ["receipt",          "Receipt"],
    ["inspection",       "Inspection Report"],
    ["permit",           "Permit"],
    ["unknown",          "Document"],
  ];

  it.each(cases)("maps '%s' → '%s'", (type, expected) => {
    expect(documentTypeLabel(type)).toBe(expected);
  });
});

describe("extractDocument — network calls", () => {
  const originalFetch = (global as any).fetch;

  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it("sends fileName, mimeType, base64Data in POST body", async () => {
    let captured: any;
    (global as any).fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      captured = JSON.parse(opts.body as string);
      return Promise.resolve({
        ok:   true,
        json: () => Promise.resolve({ documentType: "warranty", confidence: "high", description: "test" }),
      });
    });

    await extractDocument("photo.jpg", "image/jpeg", "abc123");
    expect(captured.fileName).toBe("photo.jpg");
    expect(captured.mimeType).toBe("image/jpeg");
    expect(captured.base64Data).toBe("abc123");
  });

  it("throws when the server returns an error", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok:   false,
      json: () => Promise.resolve({ error: "Unsupported file type" }),
    });

    await expect(extractDocument("bad.bmp", "image/bmp", "xyz")).rejects.toThrow("Unsupported file type");
  });

  it("returns parsed extraction on success", async () => {
    const payload = {
      documentType:   "appliance_manual",
      brand:          "LG",
      modelNumber:    "LDF5545ST",
      warrantyMonths: 24,
      confidence:     "high",
      description:    "LG dishwasher manual.",
    };

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve(payload),
    });

    const result = await extractDocument("manual.jpg", "image/jpeg", "base64");
    expect(result.brand).toBe("LG");
    expect(result.warrantyMonths).toBe(24);
    expect(result.confidence).toBe("high");
  });
});
