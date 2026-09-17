/**
 * PublicFooter — real logic worth locking down:
 *   - the copyright year is computed from the current date, not hardcoded
 *   - each footer link points to its correct route
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PublicFooter } from "@/components/PublicFooter";

afterEach(() => vi.useRealTimers());

describe("PublicFooter — copyright year", () => {
  it("uses the current year, not a hardcoded one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2031, 5, 1));
    render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    expect(screen.getByText("© 2031 HomeGentic. All rights reserved.")).toBeInTheDocument();
  });

  it("reflects a different year correctly (not a fixed string)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1));
    render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    expect(screen.getByText("© 2025 HomeGentic. All rights reserved.")).toBeInTheDocument();
  });
});

describe("PublicFooter — links", () => {
  it("links each item to its correct route", () => {
    render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    expect(screen.getByText("Security").closest("a")).toHaveAttribute("href", "/security");
    expect(screen.getByText("Privacy").closest("a")).toHaveAttribute("href", "/privacy");
    expect(screen.getByText("Terms of Service").closest("a")).toHaveAttribute("href", "/terms");
    expect(screen.getByText("Contact Us").closest("a")).toHaveAttribute("href", "/support");
  });
});
