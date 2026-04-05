/**
 * TDD — 5.3.3: Market Timing Alert component
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mock marketTimingService ─────────────────────────────────────────────────

const { mockAnalysis, mockRec } = vi.hoisted(() => {
  const mockAnalysis = {
    zip:              "78701",
    score:            78,
    season:           "spring" as const,
    marketCondition:  "hot" as const,
    estimatedPremium: { low: 14000, high: 27000 },
    listingScore:     82,
    recommendation:   "list_now" as const,
    headline:         "Listing now could yield an estimated $14,000–$27,000 above market.",
    reasoning:        [
      "Homes in 78701 are selling in ~31 days.",
      "Spring is historically the strongest selling season.",
      "Your HomeGentic score of 78 supports an estimated premium.",
    ],
    daysOnMarket:   31,
    activeListings: 1100,
    generatedAt:    Date.now(),
  };
  const mockRec = {
    shouldListNow: true,
    message:       mockAnalysis.headline,
    urgency:       "high" as const,
    analysis:      mockAnalysis,
  };
  return { mockAnalysis, mockRec };
});

vi.mock("@/services/marketTimingService", () => ({
  marketTimingService: {
    getRecommendation: vi.fn().mockResolvedValue(mockRec),
    getAnalysis:       vi.fn().mockResolvedValue(mockAnalysis),
  },
}));

import { MarketTimingAlert } from "@/components/MarketTimingAlert";

function render53(score = 78, zip = "78701") {
  return render(
    <MemoryRouter>
      <MarketTimingAlert score={score} zip={zip} />
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MarketTimingAlert (5.3.3)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders without crashing", async () => {
    render53();
    await waitFor(() => expect(screen.getByRole("region")).toBeInTheDocument());
  });

  it("shows the headline from the recommendation", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getAllByText(/14,000.*27,000|27,000.*14,000|above market/i).length).toBeGreaterThan(0)
    );
  });

  it("shows the listing score", async () => {
    render53();
    await waitFor(() => expect(screen.getByText(/82/)).toBeInTheDocument());
  });

  it("shows 'List Now' badge for list_now recommendation", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getByText(/list now/i)).toBeInTheDocument()
    );
  });

  it("shows the estimated premium range", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getAllByText(/\$14,000|\$27,000|14,000.*27,000/i).length).toBeGreaterThan(0)
    );
  });

  it("shows days on market", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getAllByText(/31.*day|days.*31/i).length).toBeGreaterThan(0)
    );
  });

  it("shows market condition badge", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getByText(/hot/i)).toBeInTheDocument()
    );
  });

  it("shows at least one reasoning point", async () => {
    render53();
    await waitFor(() =>
      expect(screen.getAllByText(/selling in.*31|31.*days|spring.*season/i).length).toBeGreaterThan(0)
    );
  });

  it("shows 'Wait' badge for wait recommendation", async () => {
    const { marketTimingService } = await import("@/services/marketTimingService");
    vi.mocked(marketTimingService.getRecommendation).mockResolvedValueOnce({
      shouldListNow: false,
      message:       "Build your score before listing.",
      urgency:       "low",
      analysis:      { ...mockAnalysis, recommendation: "wait", listingScore: 35 },
    });
    render53(30, "78701");
    await waitFor(() =>
      expect(screen.getByText(/wait/i)).toBeInTheDocument()
    );
  });

  it("calls getRecommendation with the correct score and zip", async () => {
    const { marketTimingService } = await import("@/services/marketTimingService");
    render53(88, "94102");
    await waitFor(() =>
      expect(vi.mocked(marketTimingService.getRecommendation)).toHaveBeenCalledWith(
        expect.objectContaining({ score: 88, zip: "94102" })
      )
    );
  });
});
