/**
 * ContractorBillingPanel
 *
 * Covers the Contractor Plan & Billing screen: the on-Free referral-fee
 * ledger (3% of awarded value, $20 floor) and the on-Pro fees-waived panel.
 *
 * Tests:
 *   - Shows a loading spinner while the referral-job fetch is in flight
 *   - Free tier: empty-cycle state when there are no bids won this month
 *   - Free tier: ledger rows only include verified jobs from the current cycle
 *   - Free tier: 3% fee computed correctly; $20 floor applied on small jobs (MIN badge)
 *   - Free tier: savings headline flips between "Free is cheaper" and "Pro would have saved you"
 *   - Free tier: Upgrade CTA calls onUpgradeClick
 *   - Pro tier: stats (work won / fees waived / net position) computed correctly
 *   - Pro tier: waived-fees ledger mirrors the same fee math, struck through
 *   - Pro tier: Cancel plan button calls onCancelClick
 *   - Pro tier: renders "Next invoice {date}" when renewDate is provided, else a generic label
 *   - Gracefully falls back to an empty ledger when the fetch fails
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/services/job";

vi.mock("@/services/job", () => ({
  jobService: {
    getMyReferralJobs: vi.fn(),
  },
}));

import { jobService } from "@/services/job";
import ContractorBillingPanel from "@/components/ContractorBillingPanel";

const mockGetMyReferralJobs = jobService.getMyReferralJobs as unknown as ReturnType<typeof vi.fn>;

// Dates are computed relative to the real current date (not faked — vitest's
// fake timers deadlock RTL's setTimeout-based waitFor/findBy* polling) so the
// suite stays valid regardless of when it runs.
const REAL_NOW = new Date();
function dateInCycle(monthsFromNow: number, day: number): string {
  const d = new Date(REAL_NOW.getFullYear(), REAL_NOW.getMonth() + monthsFromNow, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const THIS_CYCLE_DATE = dateInCycle(0, 6);
const LAST_CYCLE_DATE = dateInCycle(-1, 28);
const NEXT_CYCLE_DATE = dateInCycle(1, 2);

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "job-1",
    propertyId:       "prop-1",
    homeowner:        "aaaaa-aa",
    serviceType:      "HVAC",
    description:      "Water heater replacement",
    amount:            184_000, // $1,840.00 in cents
    date:             THIS_CYCLE_DATE,
    isDiy:            false,
    status:           "verified",
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    sourceQuoteId:    "QUOTE-1",
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof ContractorBillingPanel>> = {}) {
  const onUpgradeClick = vi.fn();
  const onCancelClick  = vi.fn();
  const utils = render(
    <ContractorBillingPanel
      tier="ContractorFree"
      renewDate={null}
      onUpgradeClick={onUpgradeClick}
      onCancelClick={onCancelClick}
      {...props}
    />
  );
  return { ...utils, onUpgradeClick, onCancelClick };
}

beforeEach(() => {
  mockGetMyReferralJobs.mockReset();
});

// ── Loading ──────────────────────────────────────────────────────────────────

describe("ContractorBillingPanel — loading", () => {
  it("shows a spinner while the fetch is in flight", () => {
    mockGetMyReferralJobs.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = renderPanel();
    expect(container.querySelector(".spinner-lg")).toBeInTheDocument();
  });
});

// ── Free tier ──────────────────────────────────────────────────────────────────

describe("ContractorBillingPanel — Free tier", () => {
  it("shows the empty-cycle message when there are no bids won this month", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText("No bids won yet this cycle.")).toBeInTheDocument();
    expect(screen.getByText("Contractor Free")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("excludes jobs outside the current calendar month", async () => {
    mockGetMyReferralJobs.mockResolvedValue([
      makeJob({ id: "in-cycle",  date: THIS_CYCLE_DATE, description: "In this cycle" }),
      makeJob({ id: "last-mo",   date: LAST_CYCLE_DATE, description: "Last month" }),
      makeJob({ id: "next-mo",   date: NEXT_CYCLE_DATE, description: "Next month" }),
    ]);
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText("In this cycle")).toBeInTheDocument();
    expect(screen.queryByText("Last month")).not.toBeInTheDocument();
    expect(screen.queryByText("Next month")).not.toBeInTheDocument();
  });

  it("excludes unverified jobs even when sourced via a quote request this cycle", async () => {
    mockGetMyReferralJobs.mockResolvedValue([
      makeJob({ id: "unverified", verified: false, description: "Still pending" }),
    ]);
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText("No bids won yet this cycle.")).toBeInTheDocument();
    expect(screen.queryByText("Still pending")).not.toBeInTheDocument();
  });

  it("charges 3% of awarded value on a job well above the floor", async () => {
    // $1,840 awarded — 3% = $55.20, well above the $20 floor.
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 184_000 })]);
    renderPanel({ tier: "ContractorFree" });
    // "$55.20" appears twice — once on the row, once in the "Due" total (single row = same value).
    await waitFor(() => expect(screen.getAllByText("$55.20").length).toBeGreaterThan(0));
    expect(screen.queryByText("MIN")).not.toBeInTheDocument();
  });

  it("applies the $20 floor and shows a MIN badge on a small job", async () => {
    // $185 awarded — 3% would be $5.55, so the $20 floor applies.
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 18_500, description: "Service call" })]);
    renderPanel({ tier: "ContractorFree" });
    await waitFor(() => expect(screen.getAllByText("$20.00").length).toBeGreaterThan(0));
    expect(screen.getByText("MIN")).toBeInTheDocument();
  });

  it("shows 'Pro would have saved you' when this cycle's fees exceed the Pro price", async () => {
    // 3 jobs at $1,840 each => $55.20 fee each => $165.60 total, well over $40.
    mockGetMyReferralJobs.mockResolvedValue([
      makeJob({ id: "a", amount: 184_000 }),
      makeJob({ id: "b", amount: 184_000 }),
      makeJob({ id: "c", amount: 184_000 }),
    ]);
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText(/Pro would have saved you \$125\.60 this cycle/)).toBeInTheDocument();
  });

  it("shows 'Free is still the cheaper plan' when this cycle's fees are under the Pro price", async () => {
    // One small job floored at $20 — well under the $40 Pro price.
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 18_500 })]);
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText("Free is still the cheaper plan at your volume")).toBeInTheDocument();
  });

  it("calls onUpgradeClick when the Upgrade to Pro button is clicked", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    const { onUpgradeClick } = renderPanel({ tier: "ContractorFree" });
    fireEvent.click(await screen.findByText("Upgrade to Pro — $40/mo"));
    expect(onUpgradeClick).toHaveBeenCalledTimes(1);
  });
});

// ── Pro tier ───────────────────────────────────────────────────────────────────

describe("ContractorBillingPanel — Pro tier", () => {
  it("computes work-won, fees-waived, and net-position stats", async () => {
    // $1,840 awarded, 3% = $55.20 waived. Net position vs. $40 Pro price = +$15.20.
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 184_000 })]);
    renderPanel({ tier: "ContractorPro" });

    expect(await screen.findByText("$1,840")).toBeInTheDocument();      // work won this cycle
    // "$55.20" appears in the stat card, the ledger row, and the ledger total.
    expect(screen.getAllByText("$55.20").length).toBeGreaterThan(0);
    expect(screen.getByText("+$15.20")).toBeInTheDocument();            // net position, ahead of Free
    expect(screen.getByText("Contractor Pro")).toBeInTheDocument();
    expect(screen.getByText("NO 3% FEE")).toBeInTheDocument();
  });

  it("shows a negative net position when waived fees are under the Pro price", async () => {
    // Floored $20 fee waived, still behind the $40/mo Pro price this cycle.
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 18_500 })]);
    renderPanel({ tier: "ContractorPro" });
    expect(await screen.findByText("-$20.00")).toBeInTheDocument();
  });

  it("mirrors the ledger as a waived, struck-through amount", async () => {
    mockGetMyReferralJobs.mockResolvedValue([makeJob({ amount: 18_500, description: "Service call" })]);
    renderPanel({ tier: "ContractorPro" });
    await screen.findByText("Service call");
    // "$20.00" appears in the stat card, the struck-through row, and the ledger total.
    expect(screen.getAllByText("$20.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Waived on Pro")).toBeInTheDocument();
  });

  it("shows the empty-cycle message when there are no bids won this month", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    renderPanel({ tier: "ContractorPro" });
    expect(await screen.findByText("No bids won yet this cycle.")).toBeInTheDocument();
  });

  it("calls onCancelClick when Cancel plan is clicked", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    const { onCancelClick } = renderPanel({ tier: "ContractorPro" });
    fireEvent.click(await screen.findByText("Cancel plan"));
    expect(onCancelClick).toHaveBeenCalledTimes(1);
  });

  it("shows 'Next invoice {date}' when renewDate is provided", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    renderPanel({ tier: "ContractorPro", renewDate: "Oct 15, 2026" });
    expect(await screen.findByText("Next invoice Oct 15, 2026")).toBeInTheDocument();
  });

  it("falls back to a generic label when renewDate is null", async () => {
    mockGetMyReferralJobs.mockResolvedValue([]);
    renderPanel({ tier: "ContractorPro", renewDate: null });
    expect(await screen.findByText("Active subscription")).toBeInTheDocument();
  });
});

// ── Fetch failure ────────────────────────────────────────────────────────────

describe("ContractorBillingPanel — fetch failure", () => {
  it("falls back to an empty ledger and shows a notice instead of crashing", async () => {
    mockGetMyReferralJobs.mockRejectedValue(new Error("canister unreachable"));
    renderPanel({ tier: "ContractorFree" });
    expect(await screen.findByText(/Couldn't load this cycle's bids/)).toBeInTheDocument();
    expect(screen.getByText("No bids won yet this cycle.")).toBeInTheDocument();
  });
});
