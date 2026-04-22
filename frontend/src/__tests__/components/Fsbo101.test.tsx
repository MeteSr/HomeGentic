/**
 * TDD tests for Epic 10.1 — FSBO Mode Activation
 *
 *   10.1.2 — FSBO mode activation flow (FsboPanel component)
 *   10.1.3 — FSBO savings calculator
 *   10.1.4 — Readiness score for FSBO
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
}));

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return {
    ...actual,  // re-export pure helpers (computeFsboReadiness, computeAgentCommissionSavings)
    fsboService: {
      getRecord:   vi.fn().mockReturnValue(null),
      setFsboMode: vi.fn().mockImplementation((id, price) => ({
        propertyId:     id,
        isFsbo:         true,
        listPriceCents: price,
        activatedAt:    Date.now(),
        step:           1 as const,
        hasReport:      false,
      })),
      advanceStep: vi.fn().mockImplementation((id) => ({
        propertyId: id, isFsbo: true, listPriceCents: 50_000_000,
        activatedAt: Date.now(), step: 2 as const, hasReport: false,
      })),
      deactivate: vi.fn(),
    },
  };
});

import FsboPanel from "@/components/FsboPanel";
import { computeFsboReadiness, computeAgentCommissionSavings } from "@/services/fsbo";
import { fsboService } from "@/services/fsbo";

async function renderPanel(overrides: Partial<React.ComponentProps<typeof FsboPanel>> = {}) {
  const defaults: React.ComponentProps<typeof FsboPanel> = {
    propertyId:       "prop-1",
    score:            75,
    verifiedJobCount: 3,
    hasReport:        false,
    ...overrides,
  };
  const result = render(
    <MemoryRouter>
      <FsboPanel {...defaults} />
    </MemoryRouter>
  );
  // Flush the paymentService.getMySubscription() Promise so the tier
  // updates from "Free" to "Pro" before tests begin interacting.
  await act(async () => {});
  return result;
}

// ─── 10.1.4 — Readiness scoring (pure logic, no component) ───────────────────

describe("computeFsboReadiness — readiness scoring (10.1.4)", () => {
  it("returns 'NotReady' when score is below 65", () => {
    const result = computeFsboReadiness(60, 3, false);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some((m) => /score.*65|65\+/i.test(m))).toBe(true);
  });

  it("returns 'NotReady' when verified job count is below 2 regardless of score", () => {
    const result = computeFsboReadiness(90, 1, true);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some((m) => /verified.*job|job.*verified/i.test(m))).toBe(true);
  });

  it("returns 'Ready' when score >= 65 and verifiedJobs >= 2", () => {
    const result = computeFsboReadiness(70, 2, false);
    expect(result.readiness).toBe("Ready");
    expect(result.missing.length).toBeGreaterThan(0); // still has upgrade suggestions
  });

  it("returns 'OptimallyReady' when score >= 85, verifiedJobs >= 3, and hasReport", () => {
    const result = computeFsboReadiness(88, 4, true);
    expect(result.readiness).toBe("OptimallyReady");
    expect(result.missing).toHaveLength(0);
  });

  it("'Ready' result includes suggestion to generate a public report when missing", () => {
    const result = computeFsboReadiness(86, 3, false);
    expect(result.readiness).toBe("Ready");
    expect(result.missing.some((m) => /report/i.test(m))).toBe(true);
  });
});

// ─── 10.1.3 — Savings calculator (pure logic) ────────────────────────────────

describe("computeAgentCommissionSavings (10.1.3)", () => {
  it("computes 3% of list price as savings", () => {
    expect(computeAgentCommissionSavings(48_500_000)).toBe(1_455_000); // $14,550
  });

  it("returns 0 for a 0 price", () => {
    expect(computeAgentCommissionSavings(0)).toBe(0);
  });
});

// ─── 10.1.2 — FsboPanel component ────────────────────────────────────────────

describe("FsboPanel — activation flow (10.1.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsboService.getRecord).mockReturnValue(null);
  });

  it("shows 'Sell This Home Yourself' heading", async () => {
    await renderPanel();
    expect(screen.getByText(/sell this home yourself/i)).toBeInTheDocument();
  });

  it("shows the readiness label", async () => {
    await renderPanel({ score: 75, verifiedJobCount: 3, hasReport: false });
    expect(screen.getByText(/ready|not ready|optimally ready/i)).toBeInTheDocument();
  });

  it("shows 'Ready' for score 75 with 3 verified jobs", async () => {
    await renderPanel({ score: 75, verifiedJobCount: 3, hasReport: false });
    expect(screen.getByText(/\breadyb|^ready$/i)).toBeInTheDocument();
  });

  it("shows 'Not Ready' for a low score", async () => {
    await renderPanel({ score: 55, verifiedJobCount: 1, hasReport: false });
    expect(screen.getByText(/not ready/i)).toBeInTheDocument();
  });

  it("shows 'Optimally Ready' when all criteria met", async () => {
    await renderPanel({ score: 90, verifiedJobCount: 4, hasReport: true });
    expect(screen.getByText(/optimally ready/i)).toBeInTheDocument();
  });

  it("shows missing items list when NotReady", async () => {
    await renderPanel({ score: 55, verifiedJobCount: 1, hasReport: false });
    expect(screen.getByText(/score.*65|65\+/i)).toBeInTheDocument();
    expect(screen.getByText(/verified.*job|2 verified/i)).toBeInTheDocument();
  });

  it("clicking 'Activate FSBO' shows the step checklist with a price input", async () => {
    await renderPanel({ score: 75, verifiedJobCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo|get started/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/list price/i)).toBeInTheDocument();
    });
  });

  it("shows real-time savings estimate as price is typed", async () => {
    await renderPanel({ score: 75, verifiedJobCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo|get started/i }));
    await waitFor(() => screen.getByLabelText(/list price/i));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "485000" } });
    await waitFor(() => {
      // Savings card heading appears once; the dollar amount appears in 2 places
      expect(screen.getByText(/estimated savings vs\. 3% agent/i)).toBeInTheDocument();
    });
  });

  it("submitting the price form calls fsboService.setFsboMode with cents", async () => {
    await renderPanel({ score: 75, verifiedJobCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo|get started/i }));
    await waitFor(() => screen.getByLabelText(/list price/i));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "485000" } });
    fireEvent.submit(screen.getByRole("form", { name: /fsbo price setup/i }));
    await waitFor(() => {
      expect(fsboService.setFsboMode).toHaveBeenCalledWith("prop-1", 48_500_000);
    });
  });

  it("after step 1 complete, shows step 2 'Review Report'", async () => {
    vi.mocked(fsboService.setFsboMode).mockReturnValue({
      propertyId: "prop-1", isFsbo: true,
      listPriceCents: 48_500_000, activatedAt: Date.now(),
      step: 2, hasReport: false,
    });
    await renderPanel({ score: 75, verifiedJobCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: /activate fsbo|get started/i }));
    await waitFor(() => screen.getByLabelText(/list price/i));
    fireEvent.change(screen.getByLabelText(/list price/i), { target: { value: "485000" } });
    fireEvent.submit(screen.getByRole("form", { name: /fsbo price setup/i }));
    await waitFor(() => {
      // Step 2 shows this specific CTA button
      expect(screen.getByRole("button", { name: /report looks good|skip for now/i })).toBeInTheDocument();
    });
  });
});
