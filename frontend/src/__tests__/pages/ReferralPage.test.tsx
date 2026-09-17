/**
 * ReferralPage — real logic worth locking down:
 *   - loading -> populated states
 *   - converted count derived from referrals with a non-null convertedAt
 *   - credit balance formatted as dollars (cents / 100)
 *   - copy-to-clipboard sets "Copied!" feedback
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ReferralPage from "@/pages/ReferralPage";
import type { NeighborReferral } from "@/services/neighborReferral";

const { mockGetMyCode, mockGetMyReferrals, mockGetCreditBalance, mockBuildShareUrl } = vi.hoisted(() => ({
  mockGetMyCode:        vi.fn(),
  mockGetMyReferrals:   vi.fn(),
  mockGetCreditBalance: vi.fn(),
  mockBuildShareUrl:    vi.fn((code: string) => `https://homegentic.com?ref=${code}`),
}));

vi.mock("@/services/neighborReferral", () => ({
  neighborReferralService: {
    getMyCode:        mockGetMyCode,
    getMyReferrals:   mockGetMyReferrals,
    getCreditBalance: mockGetCreditBalance,
    buildShareUrl:    mockBuildShareUrl,
  },
}));

function makeReferral(overrides: Partial<NeighborReferral> = {}): NeighborReferral {
  return {
    referrer: "p-me", referee: "principal-of-neighbor-abc123",
    code: "REF123", referredAt: BigInt(Date.now()), convertedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyCode.mockResolvedValue("REF123");
  mockGetMyReferrals.mockResolvedValue([]);
  mockGetCreditBalance.mockResolvedValue(0);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("ReferralPage — stats", () => {
  it("counts only referrals with a non-null convertedAt as converted", async () => {
    mockGetMyReferrals.mockResolvedValue([
      makeReferral({ referee: "r1", convertedAt: BigInt(123) }),
      makeReferral({ referee: "r2", convertedAt: null }),
      makeReferral({ referee: "r3", convertedAt: BigInt(456) }),
    ]);
    render(<ReferralPage />);

    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument()); // Invited
    expect(screen.getByText("2")).toBeInTheDocument(); // Converted
  });

  it("formats the credit balance from cents to dollars", async () => {
    mockGetCreditBalance.mockResolvedValue(2550); // $25.50
    render(<ReferralPage />);
    await waitFor(() => expect(screen.getByText("$25.50")).toBeInTheDocument());
  });

  it("shows Converted/Pending badges per referral", async () => {
    mockGetMyReferrals.mockResolvedValue([
      makeReferral({ referee: "converted-neighbor", convertedAt: BigInt(1) }),
      makeReferral({ referee: "pending-neighbor", convertedAt: null }),
    ]);
    render(<ReferralPage />);

    // Anchor on the referral row itself (identified by its truncated referee
    // name) rather than the badge text alone — the KPI stats row above also
    // has a static "Converted" label, so an unscoped getByText("Converted")
    // is ambiguous once both have rendered, and can resolve prematurely
    // against just the KPI label while the referral list is still committing.
    const convertedRow = (await screen.findByText(/converted-ne/)).closest("div")!;
    const pendingRow = (await screen.findByText(/pending-neig/)).closest("div")!;
    expect(within(convertedRow).getByText("Converted")).toBeInTheDocument();
    expect(within(pendingRow).getByText("Pending")).toBeInTheDocument();
  });
});

describe("ReferralPage — copy to clipboard", () => {
  it("copies the share URL and shows 'Copied!' feedback", async () => {
    render(<ReferralPage />);
    await waitFor(() => expect(screen.getByDisplayValue("https://homegentic.com?ref=REF123")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Copy"));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://homegentic.com?ref=REF123"));
    await waitFor(() => expect(screen.getByText("Copied!")).toBeInTheDocument());
  });
});
