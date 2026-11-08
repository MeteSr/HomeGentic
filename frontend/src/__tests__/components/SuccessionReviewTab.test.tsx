/**
 * SuccessionReviewTab (#724): an admin reads each successor claim's document
 * and approves it or rejects it with a reason the claimant reads.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-hot-toast", () => ({ default: mockToast }));
const { svc } = vi.hoisted(() => ({ svc: { listForReview: vi.fn(), getProof: vi.fn(), review: vi.fn() } }));
vi.mock("@/services/succession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/succession")>();
  return { ...actual, successionService: svc };
});

import { SuccessionReviewTab } from "@/components/admin/SuccessionReviewTab";

const ROW = {
  claim: {
    id: "sc-1",
    propertyId: "prop-1",
    claimant: "heir",
    claimantName: "Jordan Rivera",
    proofKind: "TrustDocument",
    fileName: "trust.pdf",
    mimeType: "application/pdf",
    proofSize: 2048,
    note: "I'm the trustee.",
    openedAt: Date.UTC(2026, 10, 8),
    waitEndsAt: Date.UTC(2026, 11, 8),
    status: { tag: "AwaitingReview" },
  },
  address: "70 Heritage Way, Orlando, FL 32801",
  successor: { name: "Jordan Rivera", email: "jordan@example.com", relationship: "Daughter", token: "t", namedAt: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  svc.listForReview.mockResolvedValue([ROW]);
});

describe("SuccessionReviewTab", () => {
  it("lists each claim with the successor the owner named", async () => {
    render(<SuccessionReviewTab />);
    expect(await screen.findByText("70 Heritage Way, Orlando, FL 32801")).toBeInTheDocument();
    expect(screen.getByText(/Trust document naming the trustee/)).toBeInTheDocument();
    expect(screen.getByText(/jordan@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/I'm the trustee\./)).toBeInTheDocument();
  });

  it("says when nothing is waiting", async () => {
    svc.listForReview.mockResolvedValue([]);
    render(<SuccessionReviewTab />);
    expect(await screen.findByText(/No successor claims waiting/i)).toBeInTheDocument();
  });

  it("opens the document", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    (URL as any).createObjectURL = vi.fn(() => "blob:proof");
    svc.getProof.mockResolvedValue({ fileName: "trust.pdf", blob: new Blob(["%PDF"], { type: "application/pdf" }) });
    render(<SuccessionReviewTab />);
    fireEvent.click(await screen.findByRole("button", { name: /open document/i }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:proof", "_blank", "noopener"));
  });

  it("approves a claim", async () => {
    svc.review.mockResolvedValue({ ...ROW.claim, status: { tag: "Approved", at: 1 } });
    render(<SuccessionReviewTab />);
    fireEvent.click(await screen.findByRole("button", { name: /approve/i }));
    await waitFor(() => expect(svc.review).toHaveBeenCalledWith("sc-1", true, ""));
    await waitFor(() => expect(screen.queryByText("70 Heritage Way, Orlando, FL 32801")).not.toBeInTheDocument());
  });

  it("needs a reason to reject", async () => {
    svc.review.mockResolvedValue({ ...ROW.claim, status: { tag: "Rejected", at: 1, reason: "x" } });
    render(<SuccessionReviewTab />);
    const reject = await screen.findByRole("button", { name: /reject/i });
    expect(reject).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "The page naming the trustee is missing." },
    });
    fireEvent.click(reject);
    await waitFor(() =>
      expect(svc.review).toHaveBeenCalledWith("sc-1", false, "The page naming the trustee is missing."),
    );
  });
});
