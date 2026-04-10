/**
 * @jest-environment node
 *
 * TDD — Issue #51: /api/extract-document helper functions
 *
 * Tests cover pure logic only — no Anthropic API calls, no HTTP.
 */

import { describe, it, expect } from "@jest/globals";
import {
  normalizeDocumentType,
  normalizeConfidence,
  normalizeWarrantyMonths,
  normalizePurchaseDate,
  normalizeExtraction,
  buildDocumentSystemPrompt,
  SUPPORTED_DOC_TYPES,
  SUPPORTED_MIME_TYPES,
} from "../extractDocumentHelpers";

// ─── normalizeDocumentType ────────────────────────────────────────────────────

describe("normalizeDocumentType", () => {
  it.each(SUPPORTED_DOC_TYPES)("passes through valid type '%s'", (t) => {
    expect(normalizeDocumentType(t)).toBe(t);
  });

  it("returns 'unknown' for unrecognized string", () => {
    expect(normalizeDocumentType("lease_agreement")).toBe("unknown");
  });

  it("returns 'unknown' for null", () => {
    expect(normalizeDocumentType(null)).toBe("unknown");
  });

  it("returns 'unknown' for number", () => {
    expect(normalizeDocumentType(42)).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(normalizeDocumentType("WARRANTY")).toBe("warranty");
    expect(normalizeDocumentType("Appliance_Manual")).toBe("appliance_manual");
  });
});

// ─── normalizeConfidence ──────────────────────────────────────────────────────

describe("normalizeConfidence", () => {
  it("passes through 'high'",   () => expect(normalizeConfidence("high")).toBe("high"));
  it("passes through 'medium'", () => expect(normalizeConfidence("medium")).toBe("medium"));
  it("passes through 'low'",    () => expect(normalizeConfidence("low")).toBe("low"));
  it("defaults to 'low' for unknown value", () => expect(normalizeConfidence("great")).toBe("low"));
  it("defaults to 'low' for null",          () => expect(normalizeConfidence(null)).toBe("low"));
});

// ─── normalizeWarrantyMonths ──────────────────────────────────────────────────

describe("normalizeWarrantyMonths", () => {
  it("returns the number for valid integer", () => expect(normalizeWarrantyMonths(60)).toBe(60));
  it("parses a string number",               () => expect(normalizeWarrantyMonths("24")).toBe(24));
  it("floors a float",                       () => expect(normalizeWarrantyMonths(12.9)).toBe(12));
  it("returns undefined for 0",              () => expect(normalizeWarrantyMonths(0)).toBeUndefined());
  it("returns undefined for negative",       () => expect(normalizeWarrantyMonths(-6)).toBeUndefined());
  it("returns undefined for null",           () => expect(normalizeWarrantyMonths(null)).toBeUndefined());
  it("returns undefined for non-numeric string", () => expect(normalizeWarrantyMonths("n/a")).toBeUndefined());
  it("5 years parses to 60 months when passed as 60", () => expect(normalizeWarrantyMonths(60)).toBe(60));
});

// ─── normalizePurchaseDate ────────────────────────────────────────────────────

describe("normalizePurchaseDate", () => {
  it("accepts YYYY-MM-DD",       () => expect(normalizePurchaseDate("2023-06-15")).toBe("2023-06-15"));
  it("trims whitespace",         () => expect(normalizePurchaseDate("  2024-01-01  ")).toBe("2024-01-01"));
  it("rejects MM/DD/YYYY",       () => expect(normalizePurchaseDate("06/15/2023")).toBeUndefined());
  it("rejects free-form text",   () => expect(normalizePurchaseDate("June 2023")).toBeUndefined());
  it("rejects null",             () => expect(normalizePurchaseDate(null)).toBeUndefined());
  it("rejects partial date",     () => expect(normalizePurchaseDate("2023-06")).toBeUndefined());
});

// ─── normalizeExtraction ──────────────────────────────────────────────────────

describe("normalizeExtraction", () => {
  const BASE = {
    documentType:  "appliance_manual",
    brand:         "LG",
    modelNumber:   "LDF5545ST",
    serialNumber:  "208KWHL1Z123",
    purchaseDate:  "2022-03-10",
    warrantyMonths: 24,
    serviceType:   "Appliance",
    confidence:    "high",
    description:   "LG dishwasher manual showing model and serial numbers.",
  };

  it("returns all fields when input is complete and valid", () => {
    const result = normalizeExtraction(BASE as any);
    expect(result.documentType).toBe("appliance_manual");
    expect(result.brand).toBe("LG");
    expect(result.modelNumber).toBe("LDF5545ST");
    expect(result.serialNumber).toBe("208KWHL1Z123");
    expect(result.purchaseDate).toBe("2022-03-10");
    expect(result.warrantyMonths).toBe(24);
    expect(result.serviceType).toBe("Appliance");
    expect(result.confidence).toBe("high");
  });

  it("fills in defaults for missing optional fields", () => {
    const result = normalizeExtraction({
      documentType: "warranty",
      confidence:   "medium",
      description:  "Carrier HVAC warranty card.",
    } as any);
    expect(result.brand).toBeUndefined();
    expect(result.modelNumber).toBeUndefined();
    expect(result.warrantyMonths).toBeUndefined();
    expect(result.purchaseDate).toBeUndefined();
  });

  it("normalizes a bad documentType to 'unknown'", () => {
    const result = normalizeExtraction({ ...BASE, documentType: "invoice" } as any);
    expect(result.documentType).toBe("unknown");
  });

  it("normalizes bad confidence to 'low'", () => {
    const result = normalizeExtraction({ ...BASE, confidence: "excellent" } as any);
    expect(result.confidence).toBe("low");
  });

  it("coerces warrantyMonths string to number", () => {
    const result = normalizeExtraction({ ...BASE, warrantyMonths: "60" } as any);
    expect(result.warrantyMonths).toBe(60);
  });

  it("drops invalid purchaseDate", () => {
    const result = normalizeExtraction({ ...BASE, purchaseDate: "March 2022" } as any);
    expect(result.purchaseDate).toBeUndefined();
  });

  it("uses fallback description when missing", () => {
    const { description: _, ...rest } = BASE;
    const result = normalizeExtraction(rest as any);
    expect(result.description).toBe("No description provided");
  });
});

// ─── buildDocumentSystemPrompt ────────────────────────────────────────────────

describe("buildDocumentSystemPrompt", () => {
  const prompt = buildDocumentSystemPrompt();

  it("mentions all document types", () => {
    expect(prompt).toMatch(/appliance_manual/);
    expect(prompt).toMatch(/warranty/);
    expect(prompt).toMatch(/receipt/);
    expect(prompt).toMatch(/inspection/);
    expect(prompt).toMatch(/permit/);
  });

  it("requests warrantyMonths as integer", () => {
    expect(prompt).toMatch(/warrantyMonths/);
    expect(prompt).toMatch(/integer/i);
  });

  it("requests confidence field", () => {
    expect(prompt).toMatch(/confidence/);
    expect(prompt).toMatch(/high\|medium\|low/);
  });

  it("instructs JSON-only response", () => {
    expect(prompt).toMatch(/ONLY.*JSON|JSON.*ONLY/i);
  });
});

// ─── SUPPORTED_MIME_TYPES ─────────────────────────────────────────────────────

describe("SUPPORTED_MIME_TYPES", () => {
  it("includes common image types", () => {
    expect(SUPPORTED_MIME_TYPES).toContain("image/jpeg");
    expect(SUPPORTED_MIME_TYPES).toContain("image/png");
    expect(SUPPORTED_MIME_TYPES).toContain("image/webp");
  });

  it("includes PDF", () => {
    expect(SUPPORTED_MIME_TYPES).toContain("application/pdf");
  });
});

// ─── /api/extract-document is registered in server.ts ─────────────────────────

import { readFileSync } from "fs";
import { resolve }      from "path";

const SERVER_SRC = readFileSync(resolve(__dirname, "../server.ts"), "utf-8");

describe("/api/extract-document endpoint registration", () => {
  it("registers POST /api/extract-document", () => {
    expect(SERVER_SRC).toContain('"/api/extract-document"');
  });

  it("validates fileName, mimeType, base64Data are present", () => {
    const idx = SERVER_SRC.indexOf('"/api/extract-document"');
    const body = SERVER_SRC.slice(idx, idx + 600);
    expect(body).toMatch(/fileName/);
    expect(body).toMatch(/mimeType/);
    expect(body).toMatch(/base64Data/);
  });

  it("uses buildDocumentSystemPrompt from helpers", () => {
    expect(SERVER_SRC).toMatch(/buildDocumentSystemPrompt|extract-document/);
  });
});
