/**
 * DocumentsTab hand-rolls a pseudo-schema into the `description` field of
 * an uploaded Photo (encodeDoc/encodePermit/encodeInspection → parseDoc).
 * There's no other safety net for this — it's pure string packing/
 * unpacking, easy to silently break while reskinning the surrounding JSX.
 * This test exists specifically to guard that round-trip before this tab
 * gets its HUD-theme redesign.
 */

import { describe, it, expect } from "vitest";
import { encodeDoc, encodePermit, encodeInspection, parseDoc, DOC_TYPES } from "@/pages/PropertyDetail/DocumentsTab";

describe("DocumentsTab encoding — plain doc round-trip", () => {
  it("round-trips a Receipt filename", () => {
    const encoded = encodeDoc("Receipt", "water-heater.pdf");
    expect(parseDoc(encoded)).toEqual({ type: "Receipt", filename: "water-heater.pdf" });
  });

  it("round-trips every DOC_TYPES value", () => {
    for (const type of DOC_TYPES) {
      const encoded = encodeDoc(type, "file.pdf");
      expect(parseDoc(encoded).type).toBe(type);
      expect(parseDoc(encoded).filename).toBe("file.pdf");
    }
  });
});

describe("DocumentsTab encoding — permit round-trip", () => {
  it("round-trips permit number/authority/status/filename", () => {
    const encoded = encodePermit("P-12345", "City of Austin", "Open", "roof-permit.pdf");
    expect(parseDoc(encoded)).toEqual({
      type: "Permit",
      permitNumber: "P-12345",
      authority: "City of Austin",
      status: "Open",
      filename: "roof-permit.pdf",
    });
  });

  it("preserves a filename containing a literal pipe character", () => {
    const encoded = encodePermit("P-1", "City", "Closed", "invoice | copy.pdf");
    expect(parseDoc(encoded).filename).toBe("invoice | copy.pdf");
  });
});

describe("DocumentsTab encoding — inspection round-trip", () => {
  it("round-trips inspector/status/filename", () => {
    const encoded = encodeInspection("Jane Doe Inspections", "Pass", "report.pdf");
    expect(parseDoc(encoded)).toEqual({
      type: "Inspection",
      inspector: "Jane Doe Inspections",
      status: "Pass",
      filename: "report.pdf",
    });
  });
});

describe("DocumentsTab encoding — legacy/malformed descriptions", () => {
  it("falls back to Receipt with the raw string as filename when there's no [Type] prefix", () => {
    expect(parseDoc("old-receipt.pdf")).toEqual({ type: "Receipt", filename: "old-receipt.pdf" });
  });

  it("falls back to Receipt when the bracketed tag isn't a known DocType", () => {
    expect(parseDoc("[Bogus] something.pdf")).toEqual({ type: "Receipt", filename: "[Bogus] something.pdf" });
  });

  it("falls back to a plain filename for a Permit-tagged description missing enough pipe-delimited fields", () => {
    expect(parseDoc("[Permit] incomplete")).toEqual({ type: "Permit", filename: "incomplete" });
  });
});
