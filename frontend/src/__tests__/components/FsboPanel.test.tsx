/**
 * TDD — 10.3.6: FsboPanel MLS integration
 *
 * When the seller reaches the "done" step in FsboPanel, a "Submit to MLS"
 * button allows them to submit their listing to a flat-fee MLS partner.
 * Tests cover: button visibility, submission call, success URL display,
 * error feedback, and loading state.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock data ────────────────────────────────────────────────────────

const { mockRecord, mockProperty } = vi.hoisted(() => ({
  mockRecord: {
    propertyId:     "42",
    isFsbo:         true,
    listPriceCents: 48_500_000,
    activatedAt:    Date.now(),
    step:           "done" as const,
    hasReport:      true,
  },
  mockProperty: {
    id:                BigInt(42),
    address:           "123 Maple St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily" as const,
    yearBuilt:         BigInt(1998),
    squareFeet:        BigInt(2100),
    verificationLevel: "Basic" as const,
    tier:              "Pro" as const,
    owner:             "owner",
    isActive:          true,
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
  },
}));

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:   vi.fn().mockReturnValue(mockRecord),
      setFsboMode: vi.fn(),
      advanceStep: vi.fn(),
      deactivate:  vi.fn(),
    },
  };
});

vi.mock("@/services/mlsService", () => ({
  mlsService: {
    submit: vi.fn().mockResolvedValue({
      listingId: "mls-001",
      url:       "https://mls.example.com/listings/mls-001",
      status:    "submitted",
    }),
  },
}));

import FsboPanel from "@/components/FsboPanel";
import { mlsService } from "@/services/mlsService";

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderPanel(overrides: Partial<React.ComponentProps<typeof FsboPanel>> = {}) {
  return render(
    <FsboPanel
      propertyId="42"
      score={72}
      verifiedJobCount={3}
      hasReport={true}
      property={mockProperty}
      {...overrides}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FsboPanel MLS integration — (10.3.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mlsService.submit).mockResolvedValue({
      listingId: "mls-001",
      url:       "https://mls.example.com/listings/mls-001",
      status:    "submitted",
    });
  });

  it("shows 'Submit to MLS' button when listing is in the done step", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /submit.*mls|mls.*submit/i })).toBeInTheDocument();
  });

  it("clicking 'Submit to MLS' calls mlsService.submit with propertyId, price, address", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /submit.*mls|mls.*submit/i }));
    await waitFor(() =>
      expect(vi.mocked(mlsService.submit)).toHaveBeenCalledWith("42", 48_500_000, "123 Maple St")
    );
  });

  it("shows the MLS listing URL after successful submission", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /submit.*mls|mls.*submit/i }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /view.*mls.*listing|mls.*listing/i })).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: /view.*mls.*listing|mls.*listing/i });
    expect(link).toHaveAttribute("href", "https://mls.example.com/listings/mls-001");
  });

  it("shows an error message if submission fails", async () => {
    vi.mocked(mlsService.submit).mockRejectedValueOnce(new Error("MLS submission failed"));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /submit.*mls|mls.*submit/i }));
    await waitFor(() =>
      expect(screen.getByText(/submission failed|could not submit|error/i)).toBeInTheDocument()
    );
  });

  it("shows a loading indicator while submitting", async () => {
    vi.mocked(mlsService.submit).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ listingId: "x", url: "u", status: "submitted" }), 500))
    );
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /submit.*mls|mls.*submit/i }));
    expect(screen.getByText(/submitting|loading/i)).toBeInTheDocument();
  });

  it("does NOT show the MLS button when property prop is absent", () => {
    render(
      <FsboPanel
        propertyId="42"
        score={72}
        verifiedJobCount={3}
        hasReport={true}
      />
    );
    expect(screen.queryByRole("button", { name: /submit.*mls|mls.*submit/i })).not.toBeInTheDocument();
  });
});
