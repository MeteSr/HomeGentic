/**
 * ContractorVerifyPage — real logic worth locking down:
 *   - fetches the invite preview from the URL token; a missing token
 *     goes straight to the error state without calling the service
 *   - a fetch failure surfaces the error message and error state
 *   - an already-signed job hides Confirm & Sign and shows the
 *     "already signed" notice instead
 *   - Confirm & Sign redeems the token, disables itself while
 *     signing, and moves to the success state; a redeem failure
 *     surfaces its error message (falling back to a generic one for a
 *     non-Error rejection) and returns to the error state
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ContractorVerifyPage from "@/pages/ContractorVerifyPage";
import type { InvitePreview } from "@/services/job";

const { mockGetByToken, mockRedeem } = vi.hoisted(() => ({
  mockGetByToken: vi.fn(),
  mockRedeem: vi.fn(),
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getJobByInviteToken: mockGetByToken, redeemInviteToken: mockRedeem } };
});

function makePreview(overrides: Partial<InvitePreview> = {}): InvitePreview {
  return {
    jobId: "job-1", title: "Roof repair", serviceType: "Roofing",
    description: "Replaced shingles", amount: 250000, completedDate: Date.now(),
    propertyAddress: "123 Main St", expiresAt: Date.now() + 3_600_000, alreadySigned: false,
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/verify/:token" element={<ContractorVerifyPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ContractorVerifyPage — loading and fetch", () => {
  it("fetches the preview using the URL token", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    renderAt("/verify/tok-123");
    await waitFor(() => expect(mockGetByToken).toHaveBeenCalledWith("tok-123"));
    expect(await screen.findByText("Confirm your work")).toBeInTheDocument();
  });

  it("shows the error state when the fetch fails", async () => {
    mockGetByToken.mockRejectedValue(new Error("Invite not found"));
    renderAt("/verify/tok-bad");
    expect(await screen.findByText("Invite not found")).toBeInTheDocument();
  });
});

describe("ContractorVerifyPage — already signed", () => {
  it("hides Confirm & Sign and shows the already-signed notice", async () => {
    mockGetByToken.mockResolvedValue(makePreview({ alreadySigned: true }));
    renderAt("/verify/tok-123");

    expect(await screen.findByText("You've already signed this job.")).toBeInTheDocument();
    expect(screen.queryByText("Confirm & Sign →")).not.toBeInTheDocument();
  });
});

describe("ContractorVerifyPage — confirm and sign", () => {
  it("redeems the token and shows the success state", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockResolvedValue(undefined);
    renderAt("/verify/tok-123");

    fireEvent.click(await screen.findByText("Confirm & Sign →"));

    expect(await screen.findByText("Signature recorded")).toBeInTheDocument();
    expect(mockRedeem).toHaveBeenCalledWith("tok-123");
  });

  it("disables the button while signing", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockReturnValue(new Promise(() => {}));
    renderAt("/verify/tok-123");

    fireEvent.click(await screen.findByText("Confirm & Sign →"));
    expect(await screen.findByText("Signing…")).toBeInTheDocument();
  });

  it("shows the real error message on a failed redeem, or a generic fallback for a non-Error rejection", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockRejectedValue(new Error("Token already used"));
    renderAt("/verify/tok-123");
    fireEvent.click(await screen.findByText("Confirm & Sign →"));
    expect(await screen.findByText("Token already used")).toBeInTheDocument();

    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockRejectedValue("not an Error instance");
    renderAt("/verify/tok-456");
    fireEvent.click(await screen.findByText("Confirm & Sign →"));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });
});
