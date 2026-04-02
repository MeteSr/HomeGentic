/**
 * TDD tests for Epic 10.5 — FSBO Offer Management
 *
 *   10.5.1 — Offer intake form (buyer name, price, earnest money, contingencies, close date, escalation)
 *   10.5.2 — Offer comparison view (net proceeds, close date, contingency count, financing strength)
 *   10.5.3 — Net proceeds calculator per offer
 *   10.5.4 — Counter-offer tracking (thread per offer, timestamps)
 *   10.5.5 — Accepted offer milestone (listing → Under Contract; score snapshot)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mock data (vi.hoisted) ────────────────────────────────────────────────────

const { mockOffer1, mockOffer2, mockCounter1 } = vi.hoisted(() => {
  const now = Date.now();

  const mockOffer1 = {
    id:                  "fo-1",
    propertyId:          "prop-1",
    buyerName:           "Alice Buyer",
    offerAmountCents:    50_000_000,   // $500,000
    earnestMoneyCents:   1_000_000,    // $10,000
    contingencies:       ["inspection", "financing"] as string[],
    closeDateMs:         now + 30 * 86_400_000,
    hasEscalationClause: false,
    status:              "Active" as const,
    loggedAt:            now - 3_000,
    counters:            [] as any[],
  };

  const mockOffer2 = {
    id:                  "fo-2",
    propertyId:          "prop-1",
    buyerName:           "Bob Buyer",
    offerAmountCents:    51_000_000,   // $510,000
    earnestMoneyCents:   2_000_000,    // $20,000
    contingencies:       ["inspection"] as string[],
    closeDateMs:         now + 25 * 86_400_000,
    hasEscalationClause: true,
    status:              "Active" as const,
    loggedAt:            now - 1_000,
    counters:            [] as any[],
  };

  const mockCounter1 = {
    id:          "ctr-1",
    offerId:     "fo-1",
    fromSeller:  true,
    amountCents: 50_500_000,
    notes:       "Please remove inspection contingency",
    createdAt:   now - 500,
  };

  return { mockOffer1, mockOffer2, mockCounter1 };
});

// ─── Service mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/fsboOffer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsboOffer")>();
  return {
    ...actual,   // re-export pure helpers (computeFsboNetProceeds, computeContingencyRisk)
    fsboOfferService: {
      getByProperty: vi.fn().mockReturnValue([]),
      logOffer:      vi.fn().mockResolvedValue(mockOffer1),
      accept:        vi.fn().mockResolvedValue({ ...mockOffer1, status: "Accepted" }),
      reject:        vi.fn().mockResolvedValue({ ...mockOffer1, status: "Rejected" }),
      addCounter:    vi.fn().mockResolvedValue({ ...mockOffer1, counters: [mockCounter1] }),
    },
  };
});

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,
    fsboService: {
      getRecord:        vi.fn().mockReturnValue({ propertyId: "prop-1", isFsbo: true, listPriceCents: 50_000_000, step: "done", status: "Active" }),
      setUnderContract: vi.fn(),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "local", profile: { role: "Homeowner", tier: "Pro" }, isAuthenticated: true,
  }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import FsboOfferPanel from "@/components/FsboOfferPanel";
import { fsboOfferService } from "@/services/fsboOffer";
import { computeFsboNetProceeds, computeContingencyRisk } from "@/services/fsboOffer";

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderPanel(offers = [] as any[]) {
  vi.mocked(fsboOfferService.getByProperty).mockReturnValue(offers);
  return render(
    <MemoryRouter>
      <FsboOfferPanel propertyId="prop-1" listPriceCents={50_000_000} />
    </MemoryRouter>
  );
}

// ─── 10.5.3 Net proceeds calculator (pure logic) ──────────────────────────────

describe("computeFsboNetProceeds — net proceeds helper (10.5.3)", () => {
  it("subtracts 2% closing costs from offer amount with no concessions", () => {
    // $500,000 × 2% = $10,000 closing; net = $490,000
    expect(computeFsboNetProceeds(50_000_000)).toBe(49_000_000);
  });

  it("subtracts concessions on top of closing costs", () => {
    // $500,000 − $10,000 closing − $5,000 concessions = $485,000
    expect(computeFsboNetProceeds(50_000_000, 500_000)).toBe(48_500_000);
  });

  it("returns 0 for a 0-dollar offer", () => {
    expect(computeFsboNetProceeds(0)).toBe(0);
  });
});

describe("computeContingencyRisk — contingency risk (10.5.3)", () => {
  it("returns 0 for no contingencies", () => {
    expect(computeContingencyRisk([])).toBe(0);
  });

  it("returns the count of contingencies", () => {
    expect(computeContingencyRisk(["inspection", "financing"])).toBe(2);
  });

  it("counts all four standard contingencies", () => {
    expect(computeContingencyRisk(["inspection", "financing", "appraisal", "saleOfHome"])).toBe(4);
  });
});

// ─── 10.5.1 Offer intake form ─────────────────────────────────────────────────

describe("FsboOfferPanel — offer intake form (10.5.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an 'Offers' section heading", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: /^offers$/i })).toBeInTheDocument();
  });

  it("shows a 'Log Offer' form with buyer name field", () => {
    renderPanel();
    expect(screen.getByLabelText(/buyer name/i)).toBeInTheDocument();
  });

  it("shows offer amount and earnest money fields", () => {
    renderPanel();
    expect(screen.getByLabelText(/offer amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/earnest money/i)).toBeInTheDocument();
  });

  it("shows a close date field", () => {
    renderPanel();
    expect(screen.getByLabelText(/close date/i)).toBeInTheDocument();
  });

  it("shows contingency checkboxes for inspection, financing, appraisal, and sale of home", () => {
    renderPanel();
    expect(screen.getByLabelText(/inspection/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/financing/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/appraisal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sale of home/i)).toBeInTheDocument();
  });

  it("shows an escalation clause checkbox", () => {
    renderPanel();
    expect(screen.getByLabelText(/escalation clause/i)).toBeInTheDocument();
  });

  it("submitting the form calls fsboOfferService.logOffer with correct data", async () => {
    vi.mocked(fsboOfferService.logOffer).mockResolvedValue(mockOffer1 as any);
    renderPanel();

    fireEvent.change(screen.getByLabelText(/buyer name/i),    { target: { value: "Alice Buyer" } });
    fireEvent.change(screen.getByLabelText(/offer amount/i),  { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText(/earnest money/i), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText(/close date/i),    { target: { value: "2025-06-01" } });
    fireEvent.click(screen.getByLabelText(/inspection/i));

    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));

    await waitFor(() => {
      expect(fsboOfferService.logOffer).toHaveBeenCalledWith(
        "prop-1",
        expect.objectContaining({
          buyerName:        "Alice Buyer",
          offerAmountCents: 50_000_000,
          earnestMoneyCents: 1_000_000,
          contingencies:    expect.arrayContaining(["inspection"]),
        })
      );
    });
  });

  it("clears the form after successful submission", async () => {
    vi.mocked(fsboOfferService.logOffer).mockResolvedValue(mockOffer1 as any);
    renderPanel();

    fireEvent.change(screen.getByLabelText(/buyer name/i),   { target: { value: "Alice Buyer" } });
    fireEvent.change(screen.getByLabelText(/offer amount/i), { target: { value: "500000" } });
    fireEvent.submit(screen.getByRole("form", { name: /log offer/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/buyer name/i) as HTMLInputElement).value).toBe("");
    });
  });
});

// ─── 10.5.2 Offer comparison view ────────────────────────────────────────────

describe("FsboOfferPanel — offer comparison view (10.5.2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows empty-state when no offers have been logged", () => {
    renderPanel([]);
    expect(screen.getByText(/no offers logged/i)).toBeInTheDocument();
  });

  it("displays each offer's buyer name", () => {
    renderPanel([mockOffer1, mockOffer2]);
    expect(screen.getByText("Alice Buyer")).toBeInTheDocument();
    expect(screen.getByText("Bob Buyer")).toBeInTheDocument();
  });

  it("displays offer amounts formatted as dollars", () => {
    renderPanel([mockOffer1]);
    expect(screen.getByText(/\$500,000|500,000/)).toBeInTheDocument();
  });

  it("shows net proceeds for each offer", () => {
    renderPanel([mockOffer1]);
    // $500,000 × 98% = $490,000 net
    expect(screen.getByText(/\$490,000|490,000/)).toBeInTheDocument();
  });

  it("shows contingency count for each offer", () => {
    renderPanel([mockOffer1]);
    // mockOffer1 has 2 contingencies
    expect(screen.getByText(/2 contingenc/i)).toBeInTheDocument();
  });

  it("shows escalation clause indicator when present", () => {
    renderPanel([mockOffer2]);
    expect(screen.getByText("Escalation")).toBeInTheDocument();
  });

  it("shows earnest money amount", () => {
    renderPanel([mockOffer1]);
    expect(screen.getByText(/\$10,000|10,000/)).toBeInTheDocument();
  });

  it("shows Accept and Reject buttons for Active offers", () => {
    renderPanel([mockOffer1]);
    expect(screen.getByRole("button", { name: /accept offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("clicking Accept calls fsboOfferService.accept with the offer id", async () => {
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /accept offer/i }));
    await waitFor(() => {
      expect(fsboOfferService.accept).toHaveBeenCalledWith("fo-1");
    });
  });

  it("clicking Reject calls fsboOfferService.reject with the offer id", async () => {
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => {
      expect(fsboOfferService.reject).toHaveBeenCalledWith("fo-1");
    });
  });

  it("shows 'Accepted' status badge after accepting", async () => {
    vi.mocked(fsboOfferService.accept).mockResolvedValue({ ...mockOffer1, status: "Accepted" } as any);
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /accept offer/i }));
    await waitFor(() => {
      expect(screen.getByText("Accepted")).toBeInTheDocument();
    });
  });
});

// ─── 10.5.4 Counter-offer tracking ───────────────────────────────────────────

describe("FsboOfferPanel — counter-offer tracking (10.5.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a 'Counter' button for Active offers", () => {
    renderPanel([mockOffer1]);
    expect(screen.getByRole("button", { name: /counter/i })).toBeInTheDocument();
  });

  it("clicking Counter reveals counter amount and notes fields", async () => {
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /counter/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/counter amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/counter notes/i)).toBeInTheDocument();
    });
  });

  it("submitting a counter calls fsboOfferService.addCounter with correct data", async () => {
    vi.mocked(fsboOfferService.addCounter).mockResolvedValue({ ...mockOffer1, counters: [mockCounter1] } as any);
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /counter/i }));
    await waitFor(() => screen.getByLabelText(/counter amount/i));

    fireEvent.change(screen.getByLabelText(/counter amount/i), { target: { value: "505000" } });
    fireEvent.change(screen.getByLabelText(/counter notes/i),  { target: { value: "Please remove inspection contingency" } });
    fireEvent.submit(screen.getByRole("form", { name: /counter offer form/i }));

    await waitFor(() => {
      expect(fsboOfferService.addCounter).toHaveBeenCalledWith(
        "fo-1",
        expect.objectContaining({
          amountCents: 50_500_000,
          notes:       "Please remove inspection contingency",
          fromSeller:  true,
        })
      );
    });
  });

  it("displays existing counter offers in the offer thread", () => {
    const offerWithCounter = { ...mockOffer1, counters: [mockCounter1] };
    renderPanel([offerWithCounter]);
    expect(screen.getByText(/please remove inspection contingency/i)).toBeInTheDocument();
  });

  it("shows counter amount formatted as dollars in the thread", () => {
    const offerWithCounter = { ...mockOffer1, counters: [mockCounter1] };
    renderPanel([offerWithCounter]);
    // $505,000 counter
    expect(screen.getByText(/\$505,000|505,000/)).toBeInTheDocument();
  });
});

// ─── 10.5.5 Accepted offer milestone ─────────────────────────────────────────

describe("FsboOfferPanel — accepted offer milestone (10.5.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls fsboService.setUnderContract when an offer is accepted", async () => {
    const { fsboService } = await import("@/services/fsbo");
    vi.mocked(fsboOfferService.accept).mockResolvedValue({ ...mockOffer1, status: "Accepted" } as any);
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /accept offer/i }));
    await waitFor(() => {
      expect(fsboService.setUnderContract).toHaveBeenCalledWith("prop-1");
    });
  });

  it("shows 'Under Contract' banner after an offer is accepted", async () => {
    vi.mocked(fsboOfferService.accept).mockResolvedValue({ ...mockOffer1, status: "Accepted" } as any);
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /accept offer/i }));
    await waitFor(() => {
      expect(screen.getByText(/under contract/i)).toBeInTheDocument();
    });
  });

  it("hides Accept/Reject/Counter buttons once listing is Under Contract", async () => {
    vi.mocked(fsboOfferService.accept).mockResolvedValue({ ...mockOffer1, status: "Accepted" } as any);
    renderPanel([mockOffer1]);
    fireEvent.click(screen.getByRole("button", { name: /accept offer/i }));
    await waitFor(() => screen.getByText(/under contract/i));
    expect(screen.queryByRole("button", { name: /accept offer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^counter$/i })).not.toBeInTheDocument();
  });
});
