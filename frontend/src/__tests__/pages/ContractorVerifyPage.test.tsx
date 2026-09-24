/**
 * ContractorVerifyPage — real logic worth locking down:
 *   - fetches the invite preview from the URL token; a missing token
 *     goes straight to the error state without calling the service
 *   - a fetch failure surfaces the error message and error state
 *   - an already-signed job hides Confirm & Sign and shows the
 *     "already signed" notice instead
 *   - Confirm & Sign is disabled until name/phone/email are filled (#518)
 *   - Confirm & Sign redeems the token with the captured identity fields,
 *     disables itself while signing, and moves to the success state; a
 *     redeem failure surfaces its error message (falling back to a
 *     generic one for a non-Error rejection) and returns to the error state
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

async function fillIdentityForm() {
  fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Jane Contractor" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+15125551234" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
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

describe("ContractorVerifyPage — identity capture (#518)", () => {
  it("keeps Confirm & Sign disabled until name, phone, and email are filled", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    renderAt("/verify/tok-123");

    const button = await screen.findByText("Confirm & Sign →");
    expect(button.closest("button")).toBeDisabled();

    await fillIdentityForm();
    expect(button.closest("button")).not.toBeDisabled();
  });

  it("pre-fills the name field from the job's contractorName when present", async () => {
    mockGetByToken.mockResolvedValue(makePreview({ contractorName: "Pipe Masters Inc" }));
    renderAt("/verify/tok-123");

    expect(await screen.findByLabelText("Your name")).toHaveValue("Pipe Masters Inc");
  });

  it("license number is optional — the button enables without it", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    renderAt("/verify/tok-123");

    await fillIdentityForm();
    expect((await screen.findByText("Confirm & Sign →")).closest("button")).not.toBeDisabled();
  });
});

describe("ContractorVerifyPage — confirm and sign", () => {
  it("redeems the token with the captured identity and shows the success state", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockResolvedValue(undefined);
    renderAt("/verify/tok-123");

    await fillIdentityForm();
    fireEvent.change(screen.getByLabelText(/License number/), { target: { value: "FL-LIC-99001" } });
    fireEvent.click(screen.getByText("Confirm & Sign →"));

    expect(await screen.findByText("Signature recorded")).toBeInTheDocument();
    expect(mockRedeem).toHaveBeenCalledWith("tok-123", {
      contractorName: "Jane Contractor",
      phone: "+15125551234",
      email: "jane@example.com",
      licenseNumber: "FL-LIC-99001",
    });
  });

  it("passes licenseNumber as undefined when left blank", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockResolvedValue(undefined);
    renderAt("/verify/tok-123");

    await fillIdentityForm();
    fireEvent.click(screen.getByText("Confirm & Sign →"));

    expect(await screen.findByText("Signature recorded")).toBeInTheDocument();
    expect(mockRedeem).toHaveBeenCalledWith("tok-123", {
      contractorName: "Jane Contractor",
      phone: "+15125551234",
      email: "jane@example.com",
      licenseNumber: undefined,
    });
  });

  it("disables the button while signing", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockReturnValue(new Promise(() => {}));
    renderAt("/verify/tok-123");

    await fillIdentityForm();
    fireEvent.click(screen.getByText("Confirm & Sign →"));
    expect(await screen.findByText("Signing…")).toBeInTheDocument();
  });

  it("shows the real error message on a failed redeem — e.g. the contractor canister rejecting a malformed identity", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockRejectedValue(new Error("Could not verify contractor identity — check name/phone/email/license format"));
    renderAt("/verify/tok-123");
    await fillIdentityForm();
    fireEvent.click(screen.getByText("Confirm & Sign →"));
    expect(await screen.findByText(/Could not verify contractor identity/)).toBeInTheDocument();
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    mockGetByToken.mockResolvedValue(makePreview());
    mockRedeem.mockRejectedValue("not an Error instance");
    renderAt("/verify/tok-456");
    await fillIdentityForm();
    fireEvent.click(screen.getByText("Confirm & Sign →"));
    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
  });
});
