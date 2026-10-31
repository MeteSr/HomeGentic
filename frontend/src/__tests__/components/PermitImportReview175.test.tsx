/**
 * §17.5.5 — PermitCoverageIndicator
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";

// ── 17.5.5 — PermitCoverageIndicator ─────────────────────────────────────────

describe("PermitCoverageIndicator", () => {
  it("shows 'available' message for a covered city", () => {
    render(<PermitCoverageIndicator city="Daytona Beach" state="FL" />);
    expect(screen.getByRole("status")).toHaveTextContent(/permit data available/i);
  });

  it("shows 'not available' message for an uncovered city", () => {
    render(<PermitCoverageIndicator city="Smalltown" state="WY" />);
    expect(screen.getByRole("status")).toHaveTextContent(/not available/i);
  });

  it("renders nothing when city or state is empty", () => {
    const { container } = render(<PermitCoverageIndicator city="" state="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when only city is provided", () => {
    const { container } = render(<PermitCoverageIndicator city="Austin" state="" />);
    expect(container.firstChild).toBeNull();
  });

  it("names the specific city in the available message", () => {
    render(<PermitCoverageIndicator city="Daytona Beach" state="FL" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Daytona Beach/);
  });
});
