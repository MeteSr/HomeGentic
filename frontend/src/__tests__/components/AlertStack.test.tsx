import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AlertStack from "@/components/AlertStack";
import type { AtRiskWarning } from "@/services/scoreDecayService";

const atRiskWarning: AtRiskWarning = {
  id:            "warranty-expiring-1",
  label:         "HVAC Warranty Expiring",
  pts:           -2,
  dueAt:         Date.now() + 14 * 86400000,
  daysRemaining: 14,
};

const defaultProps = {
  atRiskWarnings:  [] as AtRiskWarning[],
  scoreStagnant:   false,
  pulseTip:        null,
  pulseEnabled:    true,
  userTier:        "Basic" as const,
  onLogJob:        vi.fn(),
  onNavigate:      vi.fn(),
};

describe("AlertStack", () => {
  it("renders nothing when all conditions are false", () => {
    const { container } = render(
      <AlertStack
        {...defaultProps}
        userTier="Pro"
        atRiskWarnings={[]}
        scoreStagnant={false}
        pulseTip={null}
      />
    );
    // No alert cards visible
    expect(screen.queryByText("Score at Risk")).not.toBeInTheDocument();
    expect(screen.queryByText(/Score Hasn't Moved/)).not.toBeInTheDocument();
  });

  it("shows Score at Risk card when atRiskWarnings is non-empty", () => {
    render(<AlertStack {...defaultProps} atRiskWarnings={[atRiskWarning]} />);
    expect(screen.getByText("Score at Risk")).toBeInTheDocument();
    expect(screen.getByText(/HVAC Warranty Expiring/)).toBeInTheDocument();
    expect(screen.getByText(/14 day/)).toBeInTheDocument();
  });

  it("calls onLogJob when Log a Job is clicked in at-risk card", () => {
    const onLogJob = vi.fn();
    render(
      <AlertStack {...defaultProps} atRiskWarnings={[atRiskWarning]} onLogJob={onLogJob} />
    );
    // There may be multiple Log a Job buttons (at-risk + stagnation)
    const buttons = screen.getAllByText(/Log a Job/);
    fireEvent.click(buttons[0]);
    expect(onLogJob).toHaveBeenCalledTimes(1);
  });

  it("shows stagnation nudge when scoreStagnant is true", () => {
    render(<AlertStack {...defaultProps} scoreStagnant={true} />);
    expect(screen.getByText(/Score Hasn't Moved/)).toBeInTheDocument();
  });

  it("shows pulse tip when pulseEnabled and pulseTip is provided", () => {
    render(
      <AlertStack
        {...defaultProps}
        pulseTip={{ headline: "Check HVAC filters", detail: "Peak load month", category: "Seasonal" }}
        pulseEnabled={true}
      />
    );
    expect(screen.getByText("Home Pulse")).toBeInTheDocument();
    expect(screen.getByText("Check HVAC filters")).toBeInTheDocument();
  });

  it("hides pulse tip when pulseEnabled is false", () => {
    render(
      <AlertStack
        {...defaultProps}
        pulseTip={{ headline: "Check HVAC filters", detail: "Peak load month", category: "Seasonal" }}
        pulseEnabled={false}
      />
    );
    expect(screen.queryByText("Home Pulse")).not.toBeInTheDocument();
  });

  it("never shows upgrade banner (no free tier)", () => {
    render(<AlertStack {...defaultProps} userTier="Basic" />);
    expect(screen.queryByText(/Upgrade to Pro/)).not.toBeInTheDocument();
  });
});
