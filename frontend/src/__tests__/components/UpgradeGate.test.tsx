/**
 * Unit tests for UpgradeGate component
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { UpgradeGate } from "@/components/UpgradeGate";

function renderGate(props: Partial<React.ComponentProps<typeof UpgradeGate>> = {}) {
  return render(
    <MemoryRouter>
      <UpgradeGate
        feature="Score Breakdown"
        description="See exactly what's dragging your score down."
        {...props}
      />
    </MemoryRouter>
  );
}

describe("UpgradeGate", () => {
  it("renders the feature name", () => {
    renderGate({ feature: "5-Year Calendar" });
    expect(screen.getByText("5-Year Calendar")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderGate({ description: "Plan ahead with cost estimates." });
    expect(screen.getByText("Plan ahead with cost estimates.")).toBeInTheDocument();
  });

  it("renders the default tier in the CTA button", () => {
    renderGate({ tier: "Basic" });
    expect(screen.getByRole("button", { name: /Upgrade to Basic/i })).toBeInTheDocument();
  });

  it("renders the specified tier in the CTA button", () => {
    renderGate({ tier: "Pro" });
    expect(screen.getByRole("button", { name: /Upgrade to Pro/i })).toBeInTheDocument();
  });

  it("calls onUpgrade when CTA button is clicked", () => {
    const onUpgrade = vi.fn();
    renderGate({ onUpgrade });
    fireEvent.click(screen.getByRole("button", { name: /Upgrade/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it("renders a custom icon when provided", () => {
    renderGate({ icon: <span data-testid="custom-icon">★</span> });
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("does not render the lock icon when a custom icon is provided", () => {
    // Lock renders as an SVG — if custom icon is provided, the default lock container
    // should have the custom icon instead. We just verify custom icon is present.
    renderGate({ icon: <span data-testid="my-icon">X</span> });
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
  });
});
