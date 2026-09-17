/**
 * QuoteDetailPage — real logic worth locking down:
 *   - "Best Value" composite scoring (price rank * 0.55 + trust rank * 0.45)
 *   - accept flow: confirm modal -> quoteService.accept -> other pending
 *     quotes marked rejected, accepted one marked accepted
 *   - cancel flow: quoteService.cancel -> request marked cancelled
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import QuoteDetailPage from "@/pages/QuoteDetailPage";
import type { QuoteRequest, Quote } from "@/services/quote";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "req-1" }),
  };
});

const { mockGetRequest, mockGetQuotesForRequest, mockAccept, mockCancel, mockGetContractor } = vi.hoisted(() => ({
  mockGetRequest:            vi.fn(),
  mockGetQuotesForRequest:   vi.fn(),
  mockAccept:                vi.fn(),
  mockCancel:                vi.fn(),
  mockGetContractor:         vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/quote", () => ({
  quoteService: {
    getRequest: mockGetRequest,
    getQuotesForRequest: mockGetQuotesForRequest,
    accept: mockAccept,
    cancel: mockCancel,
  },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: { getContractor: mockGetContractor },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ principal: "p-owner" }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/NegotiationPanel", () => ({
  NegotiationPanel: () => null,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

const REQUEST: QuoteRequest = {
  id: "req-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
  urgency: "medium", description: "Fix AC", status: "quoted", createdAt: Date.now(),
};

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "q1", requestId: "req-1", contractor: "contractor-1",
    amount: 50000, timeline: 3, validUntil: Date.now(), status: "pending", createdAt: Date.now(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <QuoteDetailPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContractor.mockResolvedValue(null);
});

describe("QuoteDetailPage — Best Value composite scoring", () => {
  it("labels the quote with the best price/trust composite as Best Value", async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    // With only two quotes the cheaper one always wins on composite (its price
    // rank hits the 1.0 extreme), so this needs three quotes to show the score
    // actually blending price and trust: q2 is not the cheapest but wins on
    // trust score by enough to beat q1's price-rank advantage.
    mockGetQuotesForRequest.mockResolvedValue([
      makeQuote({ id: "q1", contractor: "c1", amount: 30000 }),
      makeQuote({ id: "q2", contractor: "c2", amount: 35000 }),
      makeQuote({ id: "q3", contractor: "c3", amount: 50000 }),
    ]);
    mockGetContractor.mockImplementation((principal: string) =>
      Promise.resolve(
        principal === "c1" ? { name: "Cheap Co", trustScore: 0, isVerified: false }
        : principal === "c2" ? { name: "Trusted Co", trustScore: 100, isVerified: true }
        : { name: "Mid Co", trustScore: 50, isVerified: false }
      )
    );

    renderPage();

    await waitFor(() => expect(screen.getByText("Best Value")).toBeInTheDocument());
    expect(screen.getByText("Lowest Quote")).toBeInTheDocument();
    expect(screen.getByText("Trusted Co")).toBeInTheDocument();
  });

  it("shows no Best Value badge with only a single quote", async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote()]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Accept — Lowest Price")).toBeInTheDocument());
    expect(screen.queryByText("Best Value")).not.toBeInTheDocument();
  });
});

describe("QuoteDetailPage — accept flow", () => {
  it("accepts the confirmed quote and marks the other pending quote rejected", async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    mockGetQuotesForRequest.mockResolvedValue([
      makeQuote({ id: "q1", contractor: "c1", amount: 40000 }),
      makeQuote({ id: "q2", contractor: "c2", amount: 60000 }),
    ]);
    mockAccept.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => expect(screen.getAllByText(/Accept/).length).toBeGreaterThan(0));

    // Click the accept button on the lower-amount quote (q1)
    const acceptButtons = screen.getAllByRole("button", { name: /accept/i });
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => expect(screen.getByText("Confirm Accept")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Confirm Accept"));

    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith("q1"));
    await waitFor(() => expect(screen.getByText("Accepted")).toBeInTheDocument());
    expect(screen.getByText("Not selected")).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith("Quote accepted — contractor has been notified.");
  });

  it("shows an error toast when accept fails, without marking any quote accepted", async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    mockGetQuotesForRequest.mockResolvedValue([makeQuote()]);
    mockAccept.mockRejectedValue(new Error("Quote expired"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Accept — Lowest Price")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Accept — Lowest Price"));
    await waitFor(() => expect(screen.getByText("Confirm Accept")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Confirm Accept"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Quote expired"));
    expect(screen.queryByText("Accepted")).not.toBeInTheDocument();
  });
});

describe("QuoteDetailPage — cancel flow", () => {
  it("cancels the request and shows the cancelled state", async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    mockGetQuotesForRequest.mockResolvedValue([]);
    mockCancel.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByText("HVAC")).toBeInTheDocument());

    fireEvent.click(screen.getByText(/cancel request/i));
    await waitFor(() => expect(screen.getByText("Confirm Cancel")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Confirm Cancel"));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("req-1"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Request cancelled — contractors who bid have been notified.");
  });
});
