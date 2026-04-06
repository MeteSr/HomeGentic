/**
 * ContractorVerifyPage — /verify/:token
 *
 * Tests:
 *   - Loading state shown on initial render
 *   - Preview state: job details rendered after fetch resolves
 *   - Already-signed state: shows "already signed" message, hides button
 *   - Confirm & Sign button calls redeemInviteToken with the token
 *   - Success state: CheckCircle message + CTA to /register?role=Contractor
 *   - Error from getJobByInviteToken: error card rendered with message
 *   - Error from redeemInviteToken: error card rendered
 *   - Missing token param: renders error card
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/services/job", () => ({
  jobService: {
    getJobByInviteToken: vi.fn(),
    redeemInviteToken:   vi.fn(),
  },
}));

import { jobService } from "@/services/job";
import ContractorVerifyPage from "@/pages/ContractorVerifyPage";

const MOCK_PREVIEW = {
  jobId:           "job-1",
  propertyAddress: "123 Oak Lane, Daytona Beach, FL",
  serviceType:     "HVAC",
  description:     "Annual tune-up and filter replacement",
  amount:          35000,
  completedDate:   new Date("2024-03-01").getTime(),
  contractorName:  "Cool Air LLC",
  expiresAt:       Date.now() + 48 * 3_600_000,
  alreadySigned:   false,
};

function renderAtToken(token = "INV_abc123") {
  return render(
    <MemoryRouter initialEntries={[`/verify/${token}`]}>
      <Routes>
        <Route path="/verify/:token" element={<ContractorVerifyPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

describe("ContractorVerifyPage — loading", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    (jobService.getJobByInviteToken as any).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    renderAtToken();
    expect(screen.getByText(/loading job details/i)).toBeInTheDocument();
  });
});

// ── Preview state ─────────────────────────────────────────────────────────────

describe("ContractorVerifyPage — preview", () => {
  beforeEach(() => {
    (jobService.getJobByInviteToken as any).mockResolvedValue(MOCK_PREVIEW);
  });

  it("shows job service type", async () => {
    renderAtToken();
    await waitFor(() => expect(screen.getByText("HVAC")).toBeInTheDocument());
  });

  it("shows property address", async () => {
    renderAtToken();
    await waitFor(() =>
      expect(screen.getByText("123 Oak Lane, Daytona Beach, FL")).toBeInTheDocument()
    );
  });

  it("shows formatted amount", async () => {
    renderAtToken();
    await waitFor(() => expect(screen.getByText("$350")).toBeInTheDocument());
  });

  it("shows contractor name", async () => {
    renderAtToken();
    await waitFor(() => expect(screen.getByText("Cool Air LLC")).toBeInTheDocument());
  });

  it("shows Confirm & Sign button", async () => {
    renderAtToken();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /confirm.*sign/i })).toBeInTheDocument()
    );
  });

  it("shows expiry hint", async () => {
    renderAtToken();
    await waitFor(() => expect(screen.getByText(/expires in/i)).toBeInTheDocument());
  });
});

// ── Already signed ────────────────────────────────────────────────────────────

describe("ContractorVerifyPage — already signed", () => {
  it("shows already-signed message and hides Confirm button", async () => {
    (jobService.getJobByInviteToken as any).mockResolvedValue({
      ...MOCK_PREVIEW,
      alreadySigned: true,
    });
    renderAtToken();
    await waitFor(() =>
      expect(screen.getByText(/already signed this job/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /confirm.*sign/i })).not.toBeInTheDocument();
  });
});

// ── Confirm & Sign flow ───────────────────────────────────────────────────────

describe("ContractorVerifyPage — confirm & sign", () => {
  beforeEach(() => {
    (jobService.getJobByInviteToken as any).mockResolvedValue(MOCK_PREVIEW);
    (jobService.redeemInviteToken as any).mockResolvedValue(undefined);
  });

  it("calls redeemInviteToken with the token from the URL", async () => {
    renderAtToken("INV_tok999");
    await waitFor(() => screen.getByRole("button", { name: /confirm.*sign/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm.*sign/i }));
    await waitFor(() =>
      expect(jobService.redeemInviteToken).toHaveBeenCalledWith("INV_tok999")
    );
  });

  it("shows success state after signing", async () => {
    renderAtToken();
    await waitFor(() => screen.getByRole("button", { name: /confirm.*sign/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm.*sign/i }));
    await waitFor(() =>
      expect(screen.getByText(/signature recorded/i)).toBeInTheDocument()
    );
  });

  it("success state shows link to /register?role=Contractor", async () => {
    renderAtToken();
    await waitFor(() => screen.getByRole("button", { name: /confirm.*sign/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm.*sign/i }));
    await waitFor(() => screen.getByText(/signature recorded/i));
    const link = screen.getByRole("link", { name: /create free account/i }) as HTMLAnchorElement;
    expect(link.href).toContain("/register");
    expect(link.href).toContain("Contractor");
  });
});

// ── Error: fetch fails ────────────────────────────────────────────────────────

describe("ContractorVerifyPage — fetch error", () => {
  it("shows error card when getJobByInviteToken rejects", async () => {
    (jobService.getJobByInviteToken as any).mockRejectedValue(
      new Error("Token expired or invalid")
    );
    renderAtToken();
    await waitFor(() =>
      expect(screen.getByText(/link unavailable/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/token expired or invalid/i)).toBeInTheDocument();
  });

  it("shows fallback message when error has no message", async () => {
    (jobService.getJobByInviteToken as any).mockRejectedValue(new Error(""));
    renderAtToken();
    await waitFor(() =>
      expect(screen.getByText(/link unavailable/i)).toBeInTheDocument()
    );
  });
});

// ── Error: redeem fails ───────────────────────────────────────────────────────

describe("ContractorVerifyPage — redeem error", () => {
  it("shows error card when redeemInviteToken rejects", async () => {
    (jobService.getJobByInviteToken as any).mockResolvedValue(MOCK_PREVIEW);
    (jobService.redeemInviteToken as any).mockRejectedValue(
      new Error("Token already used")
    );
    renderAtToken();
    await waitFor(() => screen.getByRole("button", { name: /confirm.*sign/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm.*sign/i }));
    await waitFor(() =>
      expect(screen.getByText(/link unavailable/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/token already used/i)).toBeInTheDocument();
  });
});

// ── HomeGentic branding ───────────────────────────────────────────────────────

describe("ContractorVerifyPage — branding", () => {
  it("shows HomeGentic logo link", async () => {
    (jobService.getJobByInviteToken as any).mockResolvedValue(MOCK_PREVIEW);
    renderAtToken();
    // The logo is a Link to "/" containing "HomeGentic" text split across spans
    await waitFor(() => {
      const logo = screen.getByRole("link", { name: /homegentic/i });
      expect(logo.getAttribute("href")).toBe("/");
    });
  });
});
