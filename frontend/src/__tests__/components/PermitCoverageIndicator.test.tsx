/**
 * Unit tests for PermitCoverageIndicator component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";

describe("PermitCoverageIndicator — supported cities", () => {
  it("shows supported indicator for Austin, TX", () => {
    render(<PermitCoverageIndicator city="Austin" state="TX" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Permit data available for Austin/);
  });

  it("shows supported indicator for Daytona Beach, FL (Volusia pilot)", () => {
    render(<PermitCoverageIndicator city="Daytona Beach" state="FL" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Permit data available for Daytona Beach/);
  });

  it("shows supported indicator for Los Angeles, CA", () => {
    render(<PermitCoverageIndicator city="Los Angeles" state="CA" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Permit data available for Los Angeles/);
  });

  it("is case-insensitive for city name", () => {
    render(<PermitCoverageIndicator city="austin" state="tx" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Permit data available/);
  });
});

describe("PermitCoverageIndicator — unsupported cities", () => {
  it("shows unsupported text for an unknown city", () => {
    render(<PermitCoverageIndicator city="Smalltown" state="KY" />);
    expect(screen.getByRole("status")).toHaveTextContent(/not available in your area/i);
  });

  it("shows supported indicator for Nashville, TN", () => {
    render(<PermitCoverageIndicator city="Nashville" state="TN" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Permit data available for Nashville/i);
  });
});

describe("PermitCoverageIndicator — empty inputs", () => {
  it("renders nothing when city is empty", () => {
    const { container } = render(<PermitCoverageIndicator city="" state="TX" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when state is empty", () => {
    const { container } = render(<PermitCoverageIndicator city="Austin" state="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when both are empty", () => {
    const { container } = render(<PermitCoverageIndicator city="" state="" />);
    expect(container.firstChild).toBeNull();
  });
});
