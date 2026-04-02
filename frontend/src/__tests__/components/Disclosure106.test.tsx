/**
 * TDD: Epic 10.6 — Seller Disclosure & Legal Documents
 *
 *  10.6.1 — Seller disclosure statement generator
 *  10.6.2 — Disclosure completeness score
 *  10.6.3 — Legal document library
 *  10.6.4 — Uploaded legal documents
 *  10.6.5 — Inspection waiver readiness
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: BigInt(1),
    owner: "principal",
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    propertyType: "SingleFamily",
    yearBuilt: BigInt(2000),
    squareFeet: BigInt(2000),
    verificationLevel: "Basic",
    tier: "Pro",
    isActive: true,
    createdAt: BigInt(0),
    updatedAt: BigInt(0),
    ...overrides,
  } as Property;
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j-1",
    propertyId: "prop-1",
    homeowner: "principal",
    serviceType: "Painting",
    contractorName: "Acme Co",
    amount: 200000,
    date: "2023-06-15",
    description: "Interior painting",
    isDiy: false,
    status: "verified" as const,
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    photos: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];

function makeKeySystemJobs(systems = KEY_SYSTEMS): Job[] {
  return systems.map((s, i) =>
    makeJob({ id: `j-ks-${i}`, serviceType: s })
  );
}

// ─── 10.6.2 Disclosure completeness score ─────────────────────────────────────

import { computeDisclosureScore } from "@/services/disclosureService";

describe("computeDisclosureScore — 10.6.2", () => {
  it("returns 0 for an unverified property with no jobs", () => {
    const p = makeProperty({ verificationLevel: "Unverified" });
    expect(computeDisclosureScore(p, [])).toBe(0);
  });

  it("returns 25 for a Basic-verified property with no jobs", () => {
    expect(computeDisclosureScore(makeProperty(), [])).toBe(25);
  });

  it("returns 25 for a Premium-verified property with no jobs", () => {
    const p = makeProperty({ verificationLevel: "Premium" });
    expect(computeDisclosureScore(p, [])).toBe(25);
  });

  it("adds 25 pts when 3+ verified jobs are present (unverified property)", () => {
    const p = makeProperty({ verificationLevel: "Unverified" });
    const jobs = [makeJob({ id: "j-1" }), makeJob({ id: "j-2" }), makeJob({ id: "j-3" })];
    // 0 (prop) + 25 (≥3 jobs) + 0 (key sys) + 0 (permit) + 10 (≥1 improvement) = 35
    expect(computeDisclosureScore(p, jobs)).toBe(35);
  });

  it("scores 60 for Basic-verified property + 3 verified non-key-system jobs", () => {
    const jobs = [
      makeJob({ id: "j-1", serviceType: "Painting" }),
      makeJob({ id: "j-2", serviceType: "Landscaping" }),
      makeJob({ id: "j-3", serviceType: "Flooring" }),
    ];
    // 25 + 25 + 0 + 0 + 10 = 60
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(60);
  });

  it("adds prorated key-system points (1 of 4 key systems verified)", () => {
    const jobs = [makeJob({ serviceType: "HVAC" })];
    // 25 + 0 + floor(25*1/4)=6 + 0 + 10 = 41
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(41);
  });

  it("adds prorated key-system points (2 of 4 key systems verified)", () => {
    const jobs = makeKeySystemJobs(["HVAC", "Roofing"]);
    // 25 + 0 + floor(25*2/4)=12 + 0 + 10 = 47
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(47);
  });

  it("adds prorated key-system points (3 of 4 key systems verified)", () => {
    const jobs = [
      ...makeKeySystemJobs(["HVAC", "Roofing", "Plumbing"]),
      makeJob({ id: "j-x1" }), makeJob({ id: "j-x2" }), // push to ≥3
    ];
    // 25 + 25 + floor(25*3/4)=18 + 0 + 10 = 78
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(78);
  });

  it("adds 15 pts when at least one job has a permit number", () => {
    const jobs = [makeJob({ permitNumber: "PERMIT-001" })];
    // 25 + 0 + 0 + 15 + 10 = 50
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(50);
  });

  it("returns 100 for a fully documented property", () => {
    const jobs = [
      ...makeKeySystemJobs(),               // 4 key systems verified
      makeJob({ id: "j-extra1" }),          // push to ≥3 verified
      makeJob({ id: "j-extra2", permitNumber: "P-001" }), // permit
    ];
    // 25 (prop) + 25 (≥3) + 25 (all 4 key) + 15 (permit) + 10 (≥1) = 100
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(100);
  });

  it("only counts verified jobs for key system and ≥3 checks", () => {
    const jobs = [
      makeJob({ id: "j-1", serviceType: "HVAC", verified: false, status: "pending" }),
      makeJob({ id: "j-2", serviceType: "HVAC", verified: false, status: "pending" }),
      makeJob({ id: "j-3", serviceType: "HVAC", verified: false, status: "pending" }),
    ];
    // Unverified jobs don't count; only property verification (+25)
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(25);
  });
});

// ─── 10.6.1 Disclosure statement generator ────────────────────────────────────

import { generateDisclosure } from "@/services/disclosureService";

describe("generateDisclosure — 10.6.1", () => {
  it("includes property address, city, state, and zip in propertyInfo", () => {
    const disclosure = generateDisclosure(makeProperty(), []);
    expect(disclosure.propertyInfo.address).toBe("123 Main St");
    expect(disclosure.propertyInfo.city).toBe("Austin");
    expect(disclosure.propertyInfo.state).toBe("TX");
    expect(disclosure.propertyInfo.zipCode).toBe("78701");
  });

  it("includes yearBuilt and squareFeet in propertyInfo", () => {
    const disclosure = generateDisclosure(makeProperty(), []);
    expect(disclosure.propertyInfo.yearBuilt).toBe(2000);
    expect(disclosure.propertyInfo.squareFeet).toBe(2000);
  });

  it("maps verified jobs to materialImprovements", () => {
    const jobs = [makeJob({ serviceType: "HVAC", date: "2022-04-10" })];
    const disclosure = generateDisclosure(makeProperty(), jobs);
    expect(disclosure.materialImprovements).toHaveLength(1);
    expect(disclosure.materialImprovements[0].serviceType).toBe("HVAC");
    expect(disclosure.materialImprovements[0].year).toBe(2022);
  });

  it("marks contractor-signed jobs as verifiedByContractor = true", () => {
    const jobs = [makeJob({ isDiy: false, contractorSigned: true })];
    const disclosure = generateDisclosure(makeProperty(), jobs);
    expect(disclosure.materialImprovements[0].verifiedByContractor).toBe(true);
  });

  it("marks DIY jobs as verifiedByContractor = false", () => {
    const jobs = [makeJob({ isDiy: true, contractorSigned: false })];
    const disclosure = generateDisclosure(makeProperty(), jobs);
    expect(disclosure.materialImprovements[0].verifiedByContractor).toBe(false);
  });

  it("excludes unverified jobs from materialImprovements", () => {
    const jobs = [
      makeJob({ id: "j-v", verified: true }),
      makeJob({ id: "j-p", verified: false, status: "pending" }),
    ];
    const disclosure = generateDisclosure(makeProperty(), jobs);
    expect(disclosure.materialImprovements).toHaveLength(1);
    expect(disclosure.materialImprovements[0].id ?? disclosure.materialImprovements[0].serviceType).toBeTruthy();
  });

  it("collects jobs with a permitNumber into the permits section", () => {
    const jobs = [
      makeJob({ id: "j-1", permitNumber: "PERMIT-2022-001" }),
      makeJob({ id: "j-2" }),
    ];
    const disclosure = generateDisclosure(makeProperty(), jobs);
    expect(disclosure.permits).toHaveLength(1);
    expect(disclosure.permits[0].permitNumber).toBe("PERMIT-2022-001");
  });

  it("starts with an empty knownDefects array", () => {
    const disclosure = generateDisclosure(makeProperty(), []);
    expect(disclosure.knownDefects).toEqual([]);
  });

  it("returns empty improvements and permits when there are no jobs", () => {
    const disclosure = generateDisclosure(makeProperty(), []);
    expect(disclosure.materialImprovements).toHaveLength(0);
    expect(disclosure.permits).toHaveLength(0);
  });
});

// ─── 10.6.5 Inspection waiver readiness ──────────────────────────────────────

import { inspectionWaiverReady } from "@/services/disclosureService";

describe("inspectionWaiverReady — 10.6.5", () => {
  it("returns false when score < 88", () => {
    expect(inspectionWaiverReady(87, makeKeySystemJobs())).toBe(false);
  });

  it("returns false when score >= 88 but no key systems are verified", () => {
    const jobs = [makeJob({ serviceType: "Painting" })];
    expect(inspectionWaiverReady(90, jobs)).toBe(false);
  });

  it("returns false when score >= 88 but only 1 key system verified", () => {
    expect(inspectionWaiverReady(90, makeKeySystemJobs(["HVAC"]))).toBe(false);
  });

  it("returns true when score >= 88 and exactly 2 key systems verified", () => {
    expect(inspectionWaiverReady(88, makeKeySystemJobs(["HVAC", "Roofing"]))).toBe(true);
  });

  it("returns true when score >= 88 and all 4 key systems verified", () => {
    expect(inspectionWaiverReady(92, makeKeySystemJobs())).toBe(true);
  });

  it("only counts verified jobs toward key system check", () => {
    const jobs = [
      makeJob({ serviceType: "HVAC",    verified: false, status: "pending" }),
      makeJob({ serviceType: "Roofing", verified: false, status: "pending" }),
    ];
    expect(inspectionWaiverReady(90, jobs)).toBe(false);
  });
});

// ─── 10.6.3 Legal document library ───────────────────────────────────────────

import { getTemplates } from "@/services/legalDocService";

describe("getTemplates — 10.6.3", () => {
  it("always returns the four universal templates regardless of state", () => {
    const templates = getTemplates("WY");
    const types = templates.map((t) => t.docType);
    expect(types).toContain("PurchaseAgreement");
    expect(types).toContain("CounterOfferForm");
    expect(types).toContain("EarnestMoneyAgreement");
    expect(types).toContain("SellerDisclosure");
  });

  it("returns additional TX-specific template for Texas", () => {
    const txTemplates = getTemplates("TX");
    const wyTemplates = getTemplates("WY");
    expect(txTemplates.length).toBeGreaterThan(wyTemplates.length);
    expect(txTemplates.some((t) => t.state === "TX")).toBe(true);
  });

  it("returns additional FL-specific template for Florida", () => {
    const flTemplates = getTemplates("FL");
    const wyTemplates = getTemplates("WY");
    expect(flTemplates.length).toBeGreaterThan(wyTemplates.length);
    expect(flTemplates.some((t) => t.state === "FL")).toBe(true);
  });

  it("does not return FL templates when querying TX", () => {
    const txTemplates = getTemplates("TX");
    expect(txTemplates.some((t) => t.state === "FL")).toBe(false);
  });

  it("each template has an id, title, docType, and description", () => {
    const templates = getTemplates("TX");
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.docType).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});

// ─── 10.6.4 Uploaded legal documents ─────────────────────────────────────────

import { legalDocService } from "@/services/legalDocService";

describe("legalDocService — 10.6.4", () => {
  beforeEach(() => legalDocService.__reset());

  it("logUpload returns a doc with propertyId, docType, and filename", () => {
    const doc = legalDocService.logUpload("prop-1", "SellerDisclosure", "disclosure.pdf");
    expect(doc.propertyId).toBe("prop-1");
    expect(doc.docType).toBe("SellerDisclosure");
    expect(doc.filename).toBe("disclosure.pdf");
  });

  it("logUpload assigns a unique id to each document", () => {
    const a = legalDocService.logUpload("prop-1", "SellerDisclosure", "a.pdf");
    const b = legalDocService.logUpload("prop-1", "PurchaseAgreement", "b.pdf");
    expect(a.id).not.toBe(b.id);
  });

  it("logUpload records an uploadedAt timestamp", () => {
    const before = Date.now();
    const doc = legalDocService.logUpload("prop-1", "SellerDisclosure", "d.pdf");
    expect(doc.uploadedAt).toBeGreaterThanOrEqual(before);
  });

  it("getUploads returns all docs for a property", () => {
    legalDocService.logUpload("prop-1", "SellerDisclosure", "a.pdf");
    legalDocService.logUpload("prop-1", "PurchaseAgreement", "b.pdf");
    expect(legalDocService.getUploads("prop-1")).toHaveLength(2);
  });

  it("getUploads does not return docs from other properties", () => {
    legalDocService.logUpload("prop-1", "SellerDisclosure", "a.pdf");
    legalDocService.logUpload("prop-2", "SellerDisclosure", "b.pdf");
    expect(legalDocService.getUploads("prop-1")).toHaveLength(1);
    expect(legalDocService.getUploads("prop-2")).toHaveLength(1);
  });

  it("getUploads returns empty array when no uploads exist for a property", () => {
    expect(legalDocService.getUploads("prop-99")).toHaveLength(0);
  });
});

// ─── DisclosurePanel component ────────────────────────────────────────────────

import DisclosurePanel from "@/components/DisclosurePanel";
import { vi } from "vitest";

vi.mock("@/services/disclosureService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/disclosureService")>();
  return { ...actual };
});

vi.mock("@/services/legalDocService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/legalDocService")>();
  return { ...actual };
});

const baseProps = {
  property:  makeProperty(),
  jobs:      [] as Job[],
};

describe("DisclosurePanel — 10.6.1 / 10.6.2 / 10.6.3 / 10.6.4 / 10.6.5", () => {
  it("renders a 'Disclosure' section heading", () => {
    render(<DisclosurePanel {...baseProps} />);
    expect(screen.getByRole("heading", { name: /disclosure/i })).toBeInTheDocument();
  });

  it("shows the completeness score as a number out of 100", () => {
    render(<DisclosurePanel {...baseProps} />);
    expect(screen.getByLabelText(/completeness score/i)).toBeInTheDocument();
  });

  it("shows a higher completeness score when the property has verified jobs", () => {
    const jobs = [makeJob({ id: "j-1" }), makeJob({ id: "j-2" }), makeJob({ id: "j-3" })];
    const { rerender } = render(<DisclosurePanel {...baseProps} />);
    const emptyScore = Number(screen.getByLabelText(/completeness score/i).textContent);
    rerender(<DisclosurePanel property={makeProperty()} jobs={jobs} />);
    const fullScore = Number(screen.getByLabelText(/completeness score/i).textContent);
    expect(fullScore).toBeGreaterThan(emptyScore);
  });

  it("shows material improvements when verified jobs are present", () => {
    const jobs = [makeJob({ serviceType: "HVAC", date: "2022-04-10" })];
    render(<DisclosurePanel property={makeProperty()} jobs={jobs} />);
    expect(screen.getByText(/hvac/i)).toBeInTheDocument();
  });

  it("shows 'Legal Documents' section with at least one template", () => {
    render(<DisclosurePanel {...baseProps} />);
    expect(screen.getByText(/legal documents/i)).toBeInTheDocument();
    // at least one template title visible (the universal "Residential Purchase Agreement")
    expect(screen.getByText(/residential purchase agreement/i)).toBeInTheDocument();
  });

  it("shows inspection waiver badge when score >= 88 and 2+ key systems verified", () => {
    const jobs = makeKeySystemJobs(["HVAC", "Roofing"]).map((j) => ({
      ...j,
      verified: true,
      status: "verified" as const,
    }));
    render(
      <DisclosurePanel
        property={makeProperty({ verificationLevel: "Premium" })}
        jobs={jobs}
        score={90}
      />
    );
    expect(screen.getByLabelText(/inspection waiver ready/i)).toBeInTheDocument();
  });

  it("hides inspection waiver badge when score < 88", () => {
    render(<DisclosurePanel {...baseProps} score={80} />);
    expect(screen.queryByLabelText(/inspection waiver ready/i)).not.toBeInTheDocument();
  });

  it("shows uploaded documents section", () => {
    render(<DisclosurePanel {...baseProps} />);
    expect(screen.getByText(/uploaded documents/i)).toBeInTheDocument();
  });
});
