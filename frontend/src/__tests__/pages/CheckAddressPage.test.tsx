/**
 * CheckAddressPage — real logic worth locking down:
 *   - the search form navigates to /check?address=<encoded> and blocks
 *     submission for a blank address
 *   - with an address param present: shows loading, then either the
 *     found-report view or the not-found view — a rejected lookup is
 *     treated as not-found, not an error state
 *   - the not-found buyer-notify form validates email before allowing
 *     submission, and shows a confirmation after a successful submit
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CheckAddressPage from "@/pages/CheckAddressPage";
import type { BuyerLookupResult } from "@/services/buyerLookup";

const { mockLookupReport, mockSubmitReportRequest } = vi.hoisted(() => ({
  mockLookupReport: vi.fn(),
  mockSubmitReportRequest: vi.fn(),
}));
vi.mock("@/services/buyerLookup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/buyerLookup")>();
  return { ...actual, lookupReport: mockLookupReport, submitReportRequest: mockSubmitReportRequest };
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><CheckAddressPage /></MemoryRouter>);
}

function makeResult(overrides: Partial<BuyerLookupResult> = {}): BuyerLookupResult {
  return { found: true, token: "tok-1", address: "123 Main St", verificationLevel: "Basic", propertyType: "SingleFamily", ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe("CheckAddressPage — search form", () => {
  it("blocks search with a blank address", () => {
    renderAt("/check");
    expect(screen.getByLabelText("check address")).toBeDisabled();
  });

  it("navigates to /check?address=<encoded> on search", () => {
    renderAt("/check");
    fireEvent.change(screen.getByLabelText("address"), { target: { value: "123 Main St, Austin, TX" } });
    fireEvent.click(screen.getByLabelText("check address"));
    expect(mockNavigate).toHaveBeenCalledWith("/check?address=123%20Main%20St%2C%20Austin%2C%20TX");
  });
});

describe("CheckAddressPage — result states", () => {
  it("shows loading then the found-report view", async () => {
    mockLookupReport.mockResolvedValue(makeResult());
    renderAt("/check?address=123%20Main%20St");
    expect(screen.getByRole("status", { name: "loading" })).toBeInTheDocument();

    expect(await screen.findByText("HomeGentic Verified")).toBeInTheDocument();
    expect(screen.getByLabelText("view report")).toHaveAttribute("href", "/report/tok-1");
  });

  it("shows the not-found view when the lookup resolves found: false", async () => {
    mockLookupReport.mockResolvedValue({ found: false, address: "123 Main St" });
    renderAt("/check?address=123%20Main%20St");
    expect(await screen.findByText("No report on file")).toBeInTheDocument();
  });

  it("falls back to the not-found view when the lookup rejects", async () => {
    mockLookupReport.mockRejectedValue(new Error("network down"));
    renderAt("/check?address=123%20Main%20St");
    expect(await screen.findByText("No report on file")).toBeInTheDocument();
  });
});

describe("CheckAddressPage — buyer notify form", () => {
  it("disables Notify Me until a valid email is entered", async () => {
    mockLookupReport.mockResolvedValue({ found: false, address: "123 Main St" });
    renderAt("/check?address=123%20Main%20St");
    await screen.findByText("No report on file");

    expect(screen.getByLabelText("notify me")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("email"), { target: { value: "not-an-email" } });
    expect(screen.getByLabelText("notify me")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "buyer@example.com" } });
    expect(screen.getByLabelText("notify me")).not.toBeDisabled();
  });

  it("submits the request and shows a confirmation", async () => {
    mockLookupReport.mockResolvedValue({ found: false, address: "123 Main St" });
    mockSubmitReportRequest.mockResolvedValue(true);
    renderAt("/check?address=123%20Main%20St");
    await screen.findByText("No report on file");

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "buyer@example.com" } });
    fireEvent.click(screen.getByLabelText("notify me"));

    await waitFor(() => expect(mockSubmitReportRequest).toHaveBeenCalledWith("123 Main St", "buyer@example.com"));
    expect(await screen.findByText("We'll notify you when a report is created for this address.")).toBeInTheDocument();
  });
});
