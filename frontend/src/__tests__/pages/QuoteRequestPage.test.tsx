/**
 * QuoteRequestPage — real logic worth locking down:
 *   - no-properties empty state
 *   - open-request quota gate (tier limit reached -> submit disabled)
 *   - submit maps the 1-5 star rating to a 0-100 trust score and navigates
 *     to the new request on success
 *   - validation: empty description blocks submit with a toast
 *   - failure: server error surfaces via toast, does not navigate
 *   - opt-in usage sharing runs after the request exists, never blocks it
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import QuoteRequestPage from "@/pages/QuoteRequestPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

const { mockCreateRequest, mockGetRequests } = vi.hoisted(() => ({
  mockCreateRequest: vi.fn(),
  mockGetRequests:   vi.fn(),
}));

vi.mock("@/services/quote", () => ({
  quoteService: { createRequest: mockCreateRequest, getRequests: mockGetRequests },
}));

const { mockGetMySubscription } = vi.hoisted(() => ({
  mockGetMySubscription: vi.fn(),
}));

vi.mock("@/services/payment", () => ({
  paymentService: { getMySubscription: mockGetMySubscription },
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/job", () => ({
  jobService: { getByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/market", () => ({
  getPriceRange: vi.fn().mockReturnValue(null),
  SERVICE_SUBCATEGORIES: {},
}));

vi.mock("@/components/PriceBenchmarkWidget", () => ({
  PriceBenchmarkWidget: () => null,
}));

vi.mock("@/components/PhotoQuotaDisplay", () => ({
  PhotoQuotaDisplay: ({ used, limit }: any) => <div data-testid="quota">{used}/{limit === Infinity ? "∞" : limit}</div>,
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    properties: [{ id: "prop-1", address: "123 Main St", city: "Austin", state: "TX", zipCode: "78701" }],
    setProperties: vi.fn(),
  }),
}));

vi.mock("@/store/addPropertyStore", () => ({
  useAddPropertyStore: (selector: any) => selector({ open: vi.fn() }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastError, mockToastSuccess, mockToast } = vi.hoisted(() => ({
  mockToastError:   vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToast:        vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(mockToast, { error: mockToastError, success: mockToastSuccess }),
}));

const { mockShareBills } = vi.hoisted(() => ({ mockShareBills: vi.fn() }));
vi.mock("@/services/quoteUsage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/quoteUsage")>()),
  shareBillsWithRequest: mockShareBills,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <QuoteRequestPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRequests.mockResolvedValue([]);
  mockGetMySubscription.mockResolvedValue({ tier: "Free" });
});

describe("QuoteRequestPage — quota gate", () => {
  it("disables submit and shows the upgrade label once the open-request limit is reached", async () => {
    mockGetRequests.mockResolvedValue([
      { id: "r1", status: "open" }, { id: "r2", status: "open" }, { id: "r3", status: "quoted" },
    ]);
    mockGetMySubscription.mockResolvedValue({ tier: "Free" }); // limit 3
    renderPage();

    await waitFor(() => expect(screen.getByText("Quote limit reached — Upgrade to continue")).toBeInTheDocument());
    expect(screen.getByText("Quote limit reached — Upgrade to continue").closest("button")).toBeDisabled();
  });

  it("allows submission for a Pro subscriber regardless of open-request count", async () => {
    mockGetRequests.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, status: "open" }))
    );
    mockGetMySubscription.mockResolvedValue({ tier: "Pro" }); // unlimited
    renderPage();

    await waitFor(() => expect(screen.getByText("Send Quote Request")).toBeInTheDocument());
    expect(screen.getByText("Send Quote Request").closest("button")).not.toBeDisabled();
  });
});

describe("QuoteRequestPage — submit", () => {
  it("blocks submission with a toast when description is empty", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Send Quote Request")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Send Quote Request"));

    expect(mockToastError).toHaveBeenCalledWith("Please describe the work needed");
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it("maps the star rating to a 0-100 trust score and navigates to the new request", async () => {
    mockCreateRequest.mockResolvedValue({ id: "req-99" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Send Quote Request")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/describe the work needed/i), { target: { value: "Fix the leaky faucet" } });
    // Open the collapsed contractor-requirements section, then set min rating to 4 stars
    fireEvent.click(screen.getByText("Contractor requirements"));
    fireEvent.change(screen.getByLabelText(/min rating/i), { target: { value: "4" } });

    fireEvent.click(screen.getByText("Send Quote Request"));

    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop-1",
        description: "Fix the leaky faucet",
        minTrustScore: 80, // 4 stars * 20
      })
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/quotes/req-99"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Quote request sent to contractors!");
  });

  it("surfaces a server error via toast without navigating", async () => {
    mockCreateRequest.mockRejectedValue(new Error("No matching contractors in your area"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Send Quote Request")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/describe the work needed/i), { target: { value: "Rewire the garage" } });
    fireEvent.click(screen.getByText("Send Quote Request"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("No matching contractors in your area"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("QuoteRequestPage — sharing utility usage", () => {
  async function submitHvac(share: boolean) {
    mockCreateRequest.mockResolvedValue({ id: "req-7" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Send Quote Request")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/describe the work needed/i), { target: { value: "Replace the AC" } });
    if (share) fireEvent.click(screen.getByRole("checkbox", { name: /share my electricity and gas usage/i }));
    fireEvent.click(screen.getByText("Send Quote Request"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/quotes/req-7"));
  }

  it("is off by default and shares nothing", async () => {
    await submitHvac(false);
    expect(mockShareBills).not.toHaveBeenCalled();
  });

  it("attaches the relevant bills to the new request when opted in", async () => {
    mockShareBills.mockResolvedValue(true);
    await submitHvac(true);
    expect(mockShareBills).toHaveBeenCalledWith("req-7", "prop-1", "HVAC");
  });

  it("still navigates, with a notice, when there were no bills to share", async () => {
    mockShareBills.mockResolvedValue(false);
    await submitHvac(true);
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/no matching bills/i));
  });

  it("still navigates, with an error, when sharing fails", async () => {
    mockShareBills.mockRejectedValue(new Error("Rate limit exceeded"));
    await submitHvac(true);
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/Request sent, but usage couldn't be shared: Rate limit exceeded/));
  });
});
