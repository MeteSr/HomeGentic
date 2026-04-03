/**
 * TDD — 7.2.5: Builder Dashboard
 *
 * Tests that BuilderDashboard renders developments, per-unit job counts,
 * pending transfer badges, bulk import UI, and transfer initiation.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mock builderService ──────────────────────────────────────────────────────

const { mockDevelopments } = vi.hoisted(() => ({
  mockDevelopments: [
    {
      propertyId: "1",
      address: "100 Pine St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      propertyType: "SingleFamily",
      yearBuilt: 2023,
      squareFeet: 1800,
      jobCount: 3,
      pendingTransfer: undefined,
    },
    {
      propertyId: "2",
      address: "200 Oak Ave",
      city: "Austin",
      state: "TX",
      zipCode: "78702",
      propertyType: "Condo",
      yearBuilt: 2023,
      squareFeet: 900,
      jobCount: 0,
      pendingTransfer: {
        propertyId: "2",
        buyerPrincipal: "buyer-abc",
        initiatedAt: Date.now() - 3_600_000,
      },
    },
  ],
}));

vi.mock("@/services/builderService", () => ({
  builderService: {
    getDevelopments:            vi.fn().mockResolvedValue(mockDevelopments),
    bulkImportProperties:       vi.fn().mockResolvedValue({ succeeded: ["10", "11"], failed: [] }),
    parsePropertiesCsv:         vi.fn().mockReturnValue([{ address: "1 Test", city: "City", state: "TX", zipCode: "78701", propertyType: "SingleFamily", yearBuilt: 2023, squareFeet: 1500 }]),
    importSubcontractorJobs:    vi.fn().mockResolvedValue({ succeeded: ["J10"], failed: [] }),
    parseJobsCsv:               vi.fn().mockReturnValue([{ propertyId: "1", serviceType: "HVAC", contractorName: "Cool Air", amountCents: 100000, date: "2024-01-01", description: "Install" }]),
    initiateFirstBuyerTransfer: vi.fn().mockResolvedValue({ propertyId: "1", buyerPrincipal: "buyer-xyz", initiatedAt: Date.now() }),
    cancelFirstBuyerTransfer:   vi.fn(),
  },
}));

import { BuilderDashboard } from "@/components/BuilderDashboard";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <BuilderDashboard />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BuilderDashboard (7.2.5)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Layout & data ──────────────────────────────────────────────────────────

  it("renders a heading", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByRole("heading")).toBeInTheDocument());
  });

  it("renders one row per development", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("100 Pine St")).toBeInTheDocument();
      expect(screen.getByText("200 Oak Ave")).toBeInTheDocument();
    });
  });

  it("shows the job count for each unit", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/3 jobs/i)).toBeInTheDocument();
    });
  });

  it("shows a 'Transfer Pending' badge for units with a pending transfer", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/transfer pending/i)).toBeInTheDocument();
    });
  });

  it("shows the buyer principal in the pending transfer badge", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/buyer-abc/i)).toBeInTheDocument();
    });
  });

  // ── Bulk import UI ─────────────────────────────────────────────────────────

  it("renders an 'Import Properties' button", async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /import properties/i })).toBeInTheDocument()
    );
  });

  it("renders an 'Import Jobs' button", async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /import jobs/i })).toBeInTheDocument()
    );
  });

  // ── Transfer initiation ────────────────────────────────────────────────────

  it("each unit row has a 'Transfer to Buyer' button", async () => {
    renderDashboard();
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /transfer to buyer/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("clicking 'Transfer to Buyer' prompts for buyer principal and calls initiateFirstBuyerTransfer", async () => {
    const { builderService } = await import("@/services/builderService");
    renderDashboard();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /transfer to buyer/i })[0]).toBeInTheDocument()
    );

    // Mock window.prompt
    vi.spyOn(window, "prompt").mockReturnValue("buyer-test-principal");

    fireEvent.click(screen.getAllByRole("button", { name: /transfer to buyer/i })[0]);

    await waitFor(() =>
      expect(vi.mocked(builderService.initiateFirstBuyerTransfer)).toHaveBeenCalledWith(
        "1",
        "buyer-test-principal"
      )
    );
  });

  it("does not call initiateFirstBuyerTransfer when prompt is cancelled", async () => {
    const { builderService } = await import("@/services/builderService");
    renderDashboard();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /transfer to buyer/i })[0]).toBeInTheDocument()
    );

    vi.spyOn(window, "prompt").mockReturnValue(null);
    fireEvent.click(screen.getAllByRole("button", { name: /transfer to buyer/i })[0]);

    expect(vi.mocked(builderService.initiateFirstBuyerTransfer)).not.toHaveBeenCalled();
  });
});
