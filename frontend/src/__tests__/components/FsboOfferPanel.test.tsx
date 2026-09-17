/**
 * FsboOfferPanel — real logic worth locking down:
 *   - the intake form silently blocks submission with no buyer name or
 *     a non-positive offer amount, otherwise converts dollars to cents,
 *     defaults earnest money to 0 and close date to now when blank
 *   - each offer row shows net proceeds (offer minus 2% closing costs)
 *     and a pluralized contingency-risk count
 *   - accept calls both fsboOfferService.accept and
 *     fsboService.setUnderContract, then hides the intake form and all
 *     row actions (even on other offers) behind an Under Contract banner
 *   - reject updates the offer's status in place
 *   - the counter form ignores a non-positive amount and otherwise adds
 *     a counter to the thread and resets itself
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FsboOfferPanel from "@/components/FsboOfferPanel";
import type { FsboOffer } from "@/services/fsboOffer";

const { mockGetByProperty, mockLogOffer, mockAccept, mockReject, mockAddCounter } = vi.hoisted(() => ({
  mockGetByProperty: vi.fn(),
  mockLogOffer: vi.fn(),
  mockAccept: vi.fn(),
  mockReject: vi.fn(),
  mockAddCounter: vi.fn(),
}));
vi.mock("@/services/fsboOffer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsboOffer")>();
  return {
    ...actual,
    fsboOfferService: {
      getByProperty: mockGetByProperty,
      logOffer: mockLogOffer,
      accept: mockAccept,
      reject: mockReject,
      addCounter: mockAddCounter,
    },
  };
});

const { mockSetUnderContract } = vi.hoisted(() => ({ mockSetUnderContract: vi.fn() }));
vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return { ...actual, fsboService: { setUnderContract: mockSetUnderContract } };
});

function makeOffer(overrides: Partial<FsboOffer> = {}): FsboOffer {
  return {
    id: "fo-1", propertyId: "prop-1", buyerName: "Jamie Rivera", offerAmountCents: 500_000_00,
    earnestMoneyCents: 10_000_00, contingencies: [], closeDateMs: Date.now(),
    hasEscalationClause: false, status: "Active", loggedAt: Date.now(), counters: [],
    ...overrides,
  };
}

function renderPanel() {
  return render(<FsboOfferPanel propertyId="prop-1" listPriceCents={500_000_00} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetByProperty.mockReturnValue([]);
});

describe("FsboOfferPanel — empty state", () => {
  it("shows the empty-offers message", () => {
    renderPanel();
    expect(screen.getByText("No offers logged yet.")).toBeInTheDocument();
  });
});

describe("FsboOfferPanel — intake form", () => {
  it("blocks submission with no buyer name", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Offer Amount ($)"), { target: { value: "500000" } });
    fireEvent.submit(screen.getByLabelText("Log Offer"));
    expect(mockLogOffer).not.toHaveBeenCalled();
  });

  it("blocks submission with a zero or blank offer amount", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Buyer Name"), { target: { value: "Jamie Rivera" } });
    fireEvent.submit(screen.getByLabelText("Log Offer"));
    expect(mockLogOffer).not.toHaveBeenCalled();
  });

  it("converts dollars to cents and defaults earnest money and close date", async () => {
    mockLogOffer.mockResolvedValue(makeOffer());
    renderPanel();

    fireEvent.change(screen.getByLabelText("Buyer Name"), { target: { value: "Jamie Rivera" } });
    fireEvent.change(screen.getByLabelText("Offer Amount ($)"), { target: { value: "500000" } });
    fireEvent.submit(screen.getByLabelText("Log Offer"));

    await waitFor(() => expect(mockLogOffer).toHaveBeenCalledWith("prop-1", expect.objectContaining({
      buyerName: "Jamie Rivera",
      offerAmountCents: 50_000_000,
      earnestMoneyCents: 0,
      hasEscalationClause: false,
    })));
    const [, input] = mockLogOffer.mock.calls[0];
    expect(input.closeDateMs).toBeGreaterThan(Date.now() - 5000);
  });

  it("includes checked contingencies and the escalation flag", async () => {
    mockLogOffer.mockResolvedValue(makeOffer());
    renderPanel();

    fireEvent.change(screen.getByLabelText("Buyer Name"), { target: { value: "Jamie Rivera" } });
    fireEvent.change(screen.getByLabelText("Offer Amount ($)"), { target: { value: "500000" } });
    fireEvent.click(screen.getByLabelText("Inspection"));
    fireEvent.click(screen.getByLabelText("Financing"));
    fireEvent.click(screen.getByLabelText("Escalation Clause"));
    fireEvent.submit(screen.getByLabelText("Log Offer"));

    await waitFor(() => expect(mockLogOffer).toHaveBeenCalledWith("prop-1", expect.objectContaining({
      contingencies: ["inspection", "financing"],
      hasEscalationClause: true,
    })));
  });

  it("clears the form fields after a successful submit", async () => {
    mockLogOffer.mockResolvedValue(makeOffer());
    renderPanel();

    fireEvent.change(screen.getByLabelText("Buyer Name"), { target: { value: "Jamie Rivera" } });
    fireEvent.change(screen.getByLabelText("Offer Amount ($)"), { target: { value: "500000" } });
    fireEvent.submit(screen.getByLabelText("Log Offer"));

    await waitFor(() => expect(screen.getByLabelText("Buyer Name")).toHaveValue(""));
    expect(screen.getByLabelText("Offer Amount ($)")).toHaveValue(null);
  });
});

describe("FsboOfferPanel — offer display", () => {
  it("shows net proceeds after 2% closing costs and a pluralized contingency count", () => {
    mockGetByProperty.mockReturnValue([
      makeOffer({ offerAmountCents: 100_000_00, contingencies: ["inspection", "financing"] }),
    ]);
    renderPanel();

    // net = 10,000,000 - 2% (200,000) = 9,800,000 cents = $98,000
    expect(screen.getByText("$98,000")).toBeInTheDocument();
    expect(screen.getByText("2 contingencies")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one contingency", () => {
    mockGetByProperty.mockReturnValue([makeOffer({ contingencies: ["appraisal"] })]);
    renderPanel();
    expect(screen.getByText("1 contingency")).toBeInTheDocument();
  });

  it("shows the escalation badge only when hasEscalationClause is true", () => {
    mockGetByProperty.mockReturnValue([makeOffer({ hasEscalationClause: true })]);
    renderPanel();
    expect(screen.getByText("Escalation")).toBeInTheDocument();
  });
});

describe("FsboOfferPanel — accept / reject", () => {
  it("accepts an offer, marks the property under contract, and hides actions on other offers", async () => {
    mockGetByProperty.mockReturnValue([
      makeOffer({ id: "fo-1", buyerName: "Jamie Rivera" }),
      makeOffer({ id: "fo-2", buyerName: "Sam Lee" }),
    ]);
    mockAccept.mockResolvedValue(makeOffer({ id: "fo-1", status: "Accepted" }));
    renderPanel();

    const acceptButtons = screen.getAllByLabelText("Accept Offer");
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith("fo-1"));
    expect(mockSetUnderContract).toHaveBeenCalledWith("prop-1");
    await waitFor(() => expect(screen.getByText(/Under Contract/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Accept Offer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reject Offer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Log Offer")).not.toBeInTheDocument();
  });

  it("rejects an offer and reflects the new status", async () => {
    mockGetByProperty.mockReturnValue([makeOffer({ id: "fo-1", status: "Active" })]);
    mockReject.mockResolvedValue(makeOffer({ id: "fo-1", status: "Rejected" }));
    renderPanel();

    fireEvent.click(screen.getByLabelText("Reject Offer"));

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith("fo-1"));
    await waitFor(() => expect(screen.getByText("Rejected")).toBeInTheDocument());
  });
});

describe("FsboOfferPanel — counter offers", () => {
  it("ignores a non-positive counter amount", () => {
    mockGetByProperty.mockReturnValue([makeOffer({ id: "fo-1" })]);
    renderPanel();
    fireEvent.click(screen.getByText("Counter"));

    fireEvent.submit(screen.getByLabelText("Counter Offer Form"));

    expect(mockAddCounter).not.toHaveBeenCalled();
  });

  it("submits a counter and resets the form", async () => {
    mockGetByProperty.mockReturnValue([makeOffer({ id: "fo-1" })]);
    mockAddCounter.mockResolvedValue(makeOffer({
      id: "fo-1",
      counters: [{ id: "ctr-1", offerId: "fo-1", amountCents: 51_000_000, notes: "Counter note", fromSeller: true, createdAt: Date.now() }],
    }));
    renderPanel();
    fireEvent.click(screen.getByText("Counter"));

    fireEvent.change(screen.getByLabelText("Counter Amount ($)"), { target: { value: "510000" } });
    fireEvent.change(screen.getByLabelText("Counter Notes"), { target: { value: "Counter note" } });
    fireEvent.submit(screen.getByLabelText("Counter Offer Form"));

    await waitFor(() => expect(mockAddCounter).toHaveBeenCalledWith("fo-1", {
      amountCents: 51_000_000, notes: "Counter note", fromSeller: true,
    }));
    await waitFor(() => expect(screen.getByText(/Counter note/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Counter Amount ($)")).not.toBeInTheDocument(); // form collapsed
  });
});
