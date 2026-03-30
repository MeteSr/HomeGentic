import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MarketIntelPanel from "@/components/MarketIntelPanel";
import type { ProjectRecommendation } from "@/services/market";

const rec: ProjectRecommendation = {
  name:                "Kitchen Remodel",
  category:            "Kitchen",
  estimatedCostCents:  2500000,
  estimatedRoiPercent: 72,
  estimatedGainCents:  1800000,
  paybackMonths:       36,
  priority:            "High",
  rationale:           "High-ROI upgrade in your market.",
  requiresPermit:      true,
};

const defaultProps = {
  recommendations: [] as ProjectRecommendation[],
  onLogJob:        vi.fn(),
  onSeeAll:        vi.fn(),
};

describe("MarketIntelPanel", () => {
  it("renders nothing when recommendations is empty", () => {
    const { container } = render(<MarketIntelPanel {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Recommended Projects header when there are recommendations", () => {
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} />);
    expect(screen.getByText("Recommended Projects")).toBeInTheDocument();
  });

  it("renders the recommendation name", () => {
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} />);
    expect(screen.getByText("Kitchen Remodel")).toBeInTheDocument();
  });

  it("renders the priority badge", () => {
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders the ROI percentage", () => {
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} />);
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("renders the rationale text", () => {
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} />);
    expect(screen.getByText("High-ROI upgrade in your market.")).toBeInTheDocument();
  });

  it("calls onLogJob with service category when Log This Job is clicked", () => {
    const onLogJob = vi.fn();
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} onLogJob={onLogJob} />);
    fireEvent.click(screen.getByText("Log This Job →"));
    expect(onLogJob).toHaveBeenCalledWith({ serviceType: "Kitchen" });
  });

  it("calls onSeeAll when See all button is clicked", () => {
    const onSeeAll = vi.fn();
    render(<MarketIntelPanel {...defaultProps} recommendations={[rec]} onSeeAll={onSeeAll} />);
    fireEvent.click(screen.getByText("See all →"));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
