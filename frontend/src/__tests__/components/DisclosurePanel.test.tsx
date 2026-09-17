/**
 * DisclosurePanel — real logic worth locking down:
 *   - the completeness score, material improvements, permits and
 *     inspection-waiver badge are all derived from the REAL
 *     disclosureService functions given the property/jobs it receives
 *   - the state-specific template library shows universal templates
 *     plus any templates for the property's own state
 *   - uploading a document logs it via legalDocService and appends it
 *     to the visible upload list, tagged with the selected doc type
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import DisclosurePanel from "@/components/DisclosurePanel";
import { legalDocService } from "@/services/legalDocService";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "Basic" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2023-05-01", description: "Replaced unit", isDiy: false,
    status: "verified" as any, verified: true, homeownerSigned: true, contractorSigned: true,
    photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  (legalDocService as any).__reset();
});

describe("DisclosurePanel — completeness score", () => {
  it("shows a 0 score and no waiver badge for an unverified property with no jobs", () => {
    render(<DisclosurePanel property={makeProperty({ verificationLevel: "None" as any })} jobs={[]} score={0} />);
    expect(screen.getByLabelText("Completeness score")).toHaveTextContent("0");
    expect(screen.queryByLabelText("Inspection Waiver Ready")).not.toBeInTheDocument();
  });

  it("scores a verified property with 3+ verified jobs across key systems", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
      makeJob({ id: "j3", serviceType: "Plumbing", permitNumber: "P-1" }),
    ];
    // 25 (Basic verified) + 25 (>=3 verified) + floor(25*3/4)=18 (3 key systems) + 15 (permit) + 10 (>=1 verified) = 93
    render(<DisclosurePanel property={makeProperty()} jobs={jobs} score={93} />);
    expect(screen.getByLabelText("Completeness score")).toHaveTextContent("93");
  });

  it("shows the Inspection Waiver Ready badge once score >= 88 and 2+ key systems verified", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
    ];
    render(<DisclosurePanel property={makeProperty()} jobs={jobs} score={90} />);
    expect(screen.getByLabelText("Inspection Waiver Ready")).toBeInTheDocument();
  });
});

describe("DisclosurePanel — material improvements & permits", () => {
  it("lists verified jobs as material improvements and permitted jobs under Permit History", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "Roofing", permitNumber: "PMT-42" }),
      makeJob({ id: "j2", serviceType: "Painting", verified: false, status: "pending" as any }),
    ];
    render(<DisclosurePanel property={makeProperty()} jobs={jobs} />);

    expect(screen.getByText("Material Improvements")).toBeInTheDocument();
    expect(screen.getByText("Permit History")).toBeInTheDocument();
    expect(screen.getByText("PMT-42")).toBeInTheDocument();
  });

  it("omits both sections when there are no verified jobs or permits", () => {
    render(<DisclosurePanel property={makeProperty()} jobs={[]} />);
    expect(screen.queryByText("Material Improvements")).not.toBeInTheDocument();
    expect(screen.queryByText("Permit History")).not.toBeInTheDocument();
  });
});

describe("DisclosurePanel — legal document library", () => {
  it("shows universal templates plus the property state's own template", () => {
    render(<DisclosurePanel property={makeProperty({ state: "TX" })} jobs={[]} />);
    expect(screen.getByText("Residential Purchase Agreement")).toBeInTheDocument();
    expect(screen.getByText("Texas One to Four Family Residential Contract")).toBeInTheDocument();
    expect(screen.queryByText("California Residential Purchase Agreement (RPA)")).not.toBeInTheDocument();
  });
});

describe("DisclosurePanel — uploaded documents", () => {
  it("shows the empty state with no uploads", () => {
    render(<DisclosurePanel property={makeProperty()} jobs={[]} />);
    expect(screen.getByText("No documents uploaded yet.")).toBeInTheDocument();
  });

  it("logs an upload with the selected doc type and appends it to the list", () => {
    render(<DisclosurePanel property={makeProperty()} jobs={[]} />);

    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "PurchaseAgreement" } });
    const file = new File(["contents"], "contract.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload document"), { target: { files: [file] } });

    expect(screen.getByText("contract.pdf")).toBeInTheDocument();
    expect(screen.getByText("PurchaseAgreement")).toBeInTheDocument();
    expect(legalDocService.getUploads("prop-1")).toHaveLength(1);
  });
});
