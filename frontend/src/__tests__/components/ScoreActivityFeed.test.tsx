import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ScoreActivityFeed from "@/components/ScoreActivityFeed";
import type { ScoreEvent } from "@/services/scoreEventService";
import type { DecayEvent } from "@/services/scoreDecayService";

const scoreEvent: ScoreEvent = {
  id:        "verified-1",
  label:     "HVAC Verified",
  detail:    "Contractor sign-off",
  pts:       4,
  timestamp: Date.now(),
  category:  "Job",
};

const decayEvent: DecayEvent = {
  id:             "warranty-expired-1",
  label:          "Roof Warranty Expired",
  detail:         "Coverage no longer active",
  pts:            -2,
  timestamp:      Date.now(),
  category:       "Warranty",
  recoveryPrompt: "Log a new Roofing service.",
};

describe("ScoreActivityFeed", () => {
  it("renders nothing when both arrays are empty", () => {
    const { container } = render(
      <ScoreActivityFeed scoreEvents={[]} decayEvents={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the Score Activity header when there are events", () => {
    render(<ScoreActivityFeed scoreEvents={[scoreEvent]} decayEvents={[]} />);
    expect(screen.getByText("Score Activity")).toBeInTheDocument();
  });

  it("renders a positive score event label", () => {
    render(<ScoreActivityFeed scoreEvents={[scoreEvent]} decayEvents={[]} />);
    expect(screen.getByText("HVAC Verified")).toBeInTheDocument();
  });

  it("shows +pts for positive events", () => {
    render(<ScoreActivityFeed scoreEvents={[scoreEvent]} decayEvents={[]} />);
    expect(screen.getByText("+4")).toBeInTheDocument();
  });

  it("renders a decay event label", () => {
    render(<ScoreActivityFeed scoreEvents={[]} decayEvents={[decayEvent]} />);
    expect(screen.getByText("Roof Warranty Expired")).toBeInTheDocument();
  });

  it("shows negative pts for decay events", () => {
    render(<ScoreActivityFeed scoreEvents={[]} decayEvents={[decayEvent]} />);
    expect(screen.getByText("-2")).toBeInTheDocument();
  });

  it("shows recovery prompt for decay events", () => {
    render(<ScoreActivityFeed scoreEvents={[]} decayEvents={[decayEvent]} />);
    expect(screen.getByText(/Log a new Roofing service/)).toBeInTheDocument();
  });

  it("shows category pill for score events", () => {
    render(<ScoreActivityFeed scoreEvents={[scoreEvent]} decayEvents={[]} />);
    expect(screen.getByText("Job")).toBeInTheDocument();
  });
});
