/**
 * SuccessorClaimsPage (#724): the claims the signed-in user opened, their
 * status, and the final step once approved and the 30 days are up.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { SuccessionClaim } from "@/services/succession";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));
const { svc } = vi.hoisted(() => ({ svc: { getMyClaims: vi.fn(), cancelClaim: vi.fn(), completeClaim: vi.fn() } }));
vi.mock("@/services/succession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/succession")>();
  return { ...actual, successionService: svc };
});

import SuccessorClaimsPage from "@/pages/SuccessorClaimsPage";

const NOW = Date.UTC(2026, 11, 20);
const claim = (over: Partial<SuccessionClaim>): SuccessionClaim => ({
  id: "sc-1",
  propertyId: "prop-1",
  claimant: "heir",
  claimantName: "Jordan Rivera",
  proofKind: "DeathCertificate",
  fileName: "c.pdf",
  mimeType: "application/pdf",
  proofSize: 10,
  note: "",
  openedAt: Date.UTC(2026, 10, 8),
  waitEndsAt: Date.UTC(2026, 11, 8),
  status: { tag: "AwaitingReview" },
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SuccessorClaimsPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("SuccessorClaimsPage", () => {
  it("says when there are no claims", async () => {
    svc.getMyClaims.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/You haven't sent any successor claims/i)).toBeInTheDocument();
  });

  it("shows each claim's status and reason", async () => {
    svc.getMyClaims.mockResolvedValue([
      claim({ id: "a" }),
      claim({ id: "b", status: { tag: "Rejected", at: 1, reason: "Page 2 is missing." } }),
      claim({ id: "c", status: { tag: "Cancelled", at: 1, by: "owner" } }),
    ]);
    renderPage();
    expect(await screen.findByText(/Waiting for HomeGentic to review the document/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 is missing\./)).toBeInTheDocument();
    expect(screen.getByText(/Cancelled\./)).toBeInTheDocument();
  });

  it("finishes an approved claim once the wait is over, then opens the home", async () => {
    svc.getMyClaims.mockResolvedValue([claim({ status: { tag: "Approved", at: 1 } })]);
    svc.completeClaim.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /take over the record/i }));
    await waitFor(() => expect(svc.completeClaim).toHaveBeenCalledWith("sc-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-1");
  });

  it("waits until the date when approved early", async () => {
    svc.getMyClaims.mockResolvedValue([
      claim({ status: { tag: "Approved", at: 1 }, waitEndsAt: Date.UTC(2027, 0, 5) }),
    ]);
    renderPage();
    expect(await screen.findByText(/on or after January 5, 2027/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take over the record/i })).not.toBeInTheDocument();
  });

  it("lets the claimant withdraw an open claim", async () => {
    svc.getMyClaims.mockResolvedValue([claim({})]);
    svc.cancelClaim.mockResolvedValue(claim({ status: { tag: "Cancelled", at: 2, by: "heir" } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /withdraw/i }));
    await waitFor(() => expect(svc.cancelClaim).toHaveBeenCalledWith("sc-1"));
    expect(await screen.findByText(/Cancelled\./)).toBeInTheDocument();
  });
});
