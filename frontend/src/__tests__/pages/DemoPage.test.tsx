/**
 * DemoPage — real logic worth locking down:
 *   - an invalid persona URL param falls back to "homeowners"
 *   - Next/Back buttons advance/retreat through the track's slides, with
 *     Back disabled on the first slide and "Get Started" shown on the last
 *   - the pricing link href varies by persona (contractors/realtors get
 *     anchor-specific hrefs, everyone else gets /pricing)
 *   - switching persona resets to the first slide
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DemoPage from "@/pages/DemoPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/demo/:persona" element={<DemoPage />} /><Route path="/demo" element={<DemoPage />} /></Routes>
    </MemoryRouter>
  );
}

describe("DemoPage — persona resolution", () => {
  it("falls back to homeowners for an invalid persona param", () => {
    renderAt("/demo/not-a-real-persona");
    expect(screen.getByText("Your home has a brain. Finally use it.")).toBeInTheDocument();
  });

  it("uses the real track title for a valid persona", () => {
    renderAt("/demo/contractors");
    expect(screen.queryByText("Your home has a brain. Finally use it.")).not.toBeInTheDocument();
  });
});

describe("DemoPage — slide navigation", () => {
  it("disables Back on the first slide", () => {
    renderAt("/demo/homeowners");
    expect(screen.getByText("Back").closest("button")).toBeDisabled();
  });

  it("advances to the next slide on Next click", () => {
    renderAt("/demo/homeowners");
    const firstTitle = screen.getByRole("heading", { level: 2 }).textContent;
    fireEvent.click(screen.getByText("Next"));
    const secondTitle = screen.getByRole("heading", { level: 2 }).textContent;
    expect(secondTitle).not.toBe(firstTitle);
  });

  it("Back becomes enabled after advancing past the first slide", () => {
    renderAt("/demo/homeowners");
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Back").closest("button")).not.toBeDisabled();
  });
});

describe("DemoPage — pricing link href by persona", () => {
  it("links to /for-pros#contractor-plans for the contractors persona", () => {
    renderAt("/demo/contractors");
    expect(screen.getByText("Get started")).toHaveAttribute("href", "/for-pros#contractor-plans");
  });

  it("links to /pricing for the homeowners persona", () => {
    renderAt("/demo/homeowners");
    expect(screen.getByText("Get started")).toHaveAttribute("href", "/pricing");
  });
});
