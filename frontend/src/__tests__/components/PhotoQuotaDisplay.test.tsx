/**
 * PhotoQuotaDisplay — real logic worth locking down:
 *   - the used/limit fraction is capped at 100% (never overflows past
 *     a full bar when used exceeds limit)
 *   - the count and bar switch color once usage exceeds 80%
 *   - the low-quota upgrade prompt only shows above 80% AND when
 *     onUpgrade is provided, and clicking it calls onUpgrade
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PhotoQuotaDisplay } from "@/components/PhotoQuotaDisplay";

describe("PhotoQuotaDisplay — usage bar", () => {
  it("shows the used/limit count and caps the bar width at 100%", () => {
    const { container } = render(<PhotoQuotaDisplay used={12} limit={10} tier="Free" />);
    expect(screen.getByText("12/10")).toBeInTheDocument();
    const bar = container.querySelector('div[style*="width: 100%"] > div')!;
    expect(bar).toHaveStyle({ width: "100%" });
  });

  it("renders a proportional bar width under the limit", () => {
    const { container } = render(<PhotoQuotaDisplay used={5} limit={10} tier="Free" />);
    const bar = container.querySelector('div[style*="width: 100%"] > div')!;
    expect(bar).toHaveStyle({ width: "50%" });
  });
});

describe("PhotoQuotaDisplay — color threshold", () => {
  it("uses the accent color at or below 80% usage", () => {
    render(<PhotoQuotaDisplay used={8} limit={10} tier="Free" />);
    expect(screen.getByText("8/10")).toHaveStyle({ color: "#2b34ff" });
  });

  it("switches to ink color once usage exceeds 80%", () => {
    render(<PhotoQuotaDisplay used={9} limit={10} tier="Free" />);
    expect(screen.getByText("9/10")).toHaveStyle({ color: "#0b0d1a" });
  });
});

describe("PhotoQuotaDisplay — upgrade prompt", () => {
  it("hides the upgrade prompt at or below 80% usage even with onUpgrade provided", () => {
    render(<PhotoQuotaDisplay used={8} limit={10} tier="Free" onUpgrade={vi.fn()} />);
    expect(screen.queryByText(/Running low/)).not.toBeInTheDocument();
  });

  it("hides the upgrade prompt above 80% when no onUpgrade is provided", () => {
    render(<PhotoQuotaDisplay used={9} limit={10} tier="Free" />);
    expect(screen.queryByText(/Running low/)).not.toBeInTheDocument();
  });

  it("shows the upgrade prompt above 80% with onUpgrade, and calls it on click", () => {
    const onUpgrade = vi.fn();
    render(<PhotoQuotaDisplay used={9} limit={10} tier="Pro" onUpgrade={onUpgrade} />);
    expect(screen.getByText("Upgrade from Pro")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Upgrade from Pro"));
    expect(onUpgrade).toHaveBeenCalled();
  });
});
