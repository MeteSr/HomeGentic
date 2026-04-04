/**
 * §17.5.4 — PermitImportReviewPanel
 * §17.5.5 — PermitCoverageIndicator
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PermitImportReviewPanel from "@/components/PermitImportReviewPanel";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";
import type { ImportedPermit } from "@/services/permitImport";

// ── 17.5.4 — PermitImportReviewPanel ─────────────────────────────────────────

const PERMITS: ImportedPermit[] = [
  {
    permit: {
      permitNumber: "2020-ROOF-01",
      permitType:   "Roofing Permit",
      description:  "Shingle replacement",
      issuedDate:   "2020-05-10",
      status:       "Finaled",
    },
    serviceType: "Roofing",
    jobInput:    { propertyId: "prop-1", serviceType: "Roofing", description: "Shingle replacement", amount: 0, date: "2020-05-10", isDiy: true, status: "verified" } as any,
  },
  {
    permit: {
      permitNumber:        "2021-ELEC-02",
      permitType:          "Electrical Permit",
      description:         "Panel upgrade 200A",
      issuedDate:          "2021-06-15",
      status:              "Finaled",
      estimatedValueCents: 350_000,
      contractorName:      "Bright Spark Electric",
    },
    serviceType: "Electrical",
    jobInput:    { propertyId: "prop-1", serviceType: "Electrical", description: "Panel upgrade 200A", amount: 350000, date: "2021-06-15", isDiy: false, contractorName: "Bright Spark Electric", status: "verified" } as any,
  },
];

describe("PermitImportReviewPanel", () => {
  it("renders a row for each permit", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/Roofing/i)).toBeInTheDocument();
    expect(screen.getByText(/Electrical/i)).toBeInTheDocument();
  });

  it("shows the permit number for each row", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/2020-ROOF-01/)).toBeInTheDocument();
    expect(screen.getByText(/2021-ELEC-02/)).toBeInTheDocument();
  });

  it("shows the issued date", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/2020-05-10/)).toBeInTheDocument();
    expect(screen.getByText(/2021-06-15/)).toBeInTheDocument();
  });

  it("shows contractor name when present", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/Bright Spark Electric/)).toBeInTheDocument();
  });

  it("shows estimated cost when present", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/\$3,500|\$3500/)).toBeInTheDocument();
  });

  it("has a dismiss checkbox/button for each permit row", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    const dismissButtons = screen.getAllByRole("checkbox");
    expect(dismissButtons.length).toBe(2);
  });

  it("calls onConfirm with all non-dismissed permits when submitted", () => {
    const onConfirm = vi.fn();
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={onConfirm} onDismissAll={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    expect(onConfirm).toHaveBeenCalledWith(PERMITS);
  });

  it("excludes dismissed permits from onConfirm", () => {
    const onConfirm = vi.fn();
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={onConfirm} onDismissAll={vi.fn()} />);
    // Dismiss the first permit
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    const confirmed: ImportedPermit[] = onConfirm.mock.calls[0][0];
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].permit.permitNumber).toBe("2021-ELEC-02");
  });

  it("calls onDismissAll when 'skip' is clicked", () => {
    const onDismissAll = vi.fn();
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={onDismissAll} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDismissAll).toHaveBeenCalledOnce();
  });

  it("shows permit count in heading", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/2 permits? found/i)).toBeInTheDocument();
  });

  it("disables 'add to history' button when all permits dismissed", () => {
    render(<PermitImportReviewPanel permits={PERMITS} onConfirm={vi.fn()} onDismissAll={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(screen.getByRole("button", { name: /add to history/i })).toBeDisabled();
  });
});

// ── 17.5.5 — PermitCoverageIndicator ─────────────────────────────────────────

describe("PermitCoverageIndicator", () => {
  it("shows 'available' message for a covered city", () => {
    render(<PermitCoverageIndicator city="Daytona Beach" state="FL" />);
    expect(screen.getByRole("status")).toHaveTextContent(/permit data available/i);
  });

  it("shows 'not available' message for an uncovered city", () => {
    render(<PermitCoverageIndicator city="Smalltown" state="WY" />);
    expect(screen.getByRole("status")).toHaveTextContent(/not available/i);
  });

  it("renders nothing when city or state is empty", () => {
    const { container } = render(<PermitCoverageIndicator city="" state="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when only city is provided", () => {
    const { container } = render(<PermitCoverageIndicator city="Austin" state="" />);
    expect(container.firstChild).toBeNull();
  });

  it("names the specific city in the available message", () => {
    render(<PermitCoverageIndicator city="Daytona Beach" state="FL" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Daytona Beach/);
  });
});
