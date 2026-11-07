/**
 * The document vault hand-rolls a pseudo-schema into the `description` field of
 * an uploaded Photo (encodeDoc/encodePermit/encodeInspection → parseDoc).
 * There's no other safety net for this — it's pure string packing/
 * unpacking, easy to silently break while reskinning the surrounding JSX.
 * This test exists specifically to guard that round-trip before this tab
 * gets its HUD-theme redesign.
 */

import { describe, it, expect } from "vitest";
import { encodeDoc, encodePermit, encodeInspection, parseDoc, DOC_TYPES, DOC_TYPE_LABELS, DOC_GROUPS, docGroupOf, docTypeFromOnboardingLabel, canEditDocuments } from "@/services/documentVault";

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

describe("document vault — home papers", () => {
  it.each([
    ["Deed", "Deed"],
    ["Closing", "Closing papers"],
    ["Title", "Title policy"],
    ["Survey", "Survey"],
    ["Insurance", "Insurance policy"],
    ["Elevation", "Elevation certificate"],
    ["HOA", "HOA documents"],
    ["Manual", "Manual"],
    ["Other", "Other"],
  ] as const)("keeps %s papers and labels them %s", (type, label) => {
    expect(DOC_TYPES).toContain(type);
    expect(DOC_TYPE_LABELS[type]).toBe(label);
    expect(parseDoc(encodeDoc(type, "scan.pdf"))).toEqual({ type, filename: "scan.pdf" });
  });

  it("still reads the original five types", () => {
    for (const t of ["Receipt", "Permit", "Inspection", "Warranty", "Invoice"] as const) {
      expect(DOC_TYPES).toContain(t);
    }
  });

  it("puts every type in exactly one group", () => {
    const grouped = DOC_GROUPS.flatMap((g) => g.types);
    expect([...grouped].sort()).toEqual([...DOC_TYPES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("groups papers the way an owner looks for them", () => {
    expect(docGroupOf("Deed").label).toBe("Ownership and closing");
    expect(docGroupOf("Closing").label).toBe("Ownership and closing");
    expect(docGroupOf("Insurance").label).toBe("Insurance and risk");
    expect(docGroupOf("Elevation").label).toBe("Insurance and risk");
    expect(docGroupOf("HOA").label).toBe("Home and HOA");
    expect(docGroupOf("Receipt").label).toBe("Work records");
    expect(docGroupOf("Permit").label).toBe("Work records");
  });
});

describe("document vault — onboarding uploads", () => {
  it.each([
    ["Receipt", "Receipt"],
    ["Invoice", "Invoice"],
    ["Permit", "Permit"],
    ["Warranty Card", "Warranty"],
    ["Inspection Report", "Inspection"],
    ["Before Photo", "Other"],
    ["After Photo", "Other"],
    ["Other", "Other"],
    ["something new", "Other"],
  ] as const)("files the onboarding choice %s as %s", (label, type) => {
    expect(docTypeFromOnboardingLabel(label)).toBe(type);
  });
});

describe("document vault — who can change files", () => {
  it.each([
    ["Owner", true], ["CoOwner", true], ["Manager", true], [null, true],
    ["Viewer", false], ["NoAccess", false],
  ] as const)("%s → %s", (role, allowed) => {
    expect(canEditDocuments(role)).toBe(allowed);
  });
});
