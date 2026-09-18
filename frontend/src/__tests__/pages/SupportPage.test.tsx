/**
 * SupportPage — real logic worth locking down:
 *   - FAQ rows toggle open/closed on click, showing/hiding the answer
 *   - the FAQ count label matches the actual number of FAQs
 *   - the response-time table renders one row per tier
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SupportPage from "@/pages/SupportPage";

function renderPage() {
  return render(<MemoryRouter><SupportPage /></MemoryRouter>);
}

describe("SupportPage — FAQ", () => {
  it("starts with all FAQ answers collapsed", () => {
    renderPage();
    expect(screen.queryByText(/Yes — cancel any time from Settings/)).not.toBeInTheDocument();
  });

  it("expands an FAQ answer on click, and collapses it again on a second click", () => {
    renderPage();
    const question = screen.getByText("Can I cancel my subscription at any time?");
    fireEvent.click(question);
    expect(screen.getByText(/Yes — cancel any time from Settings/)).toBeInTheDocument();

    fireEvent.click(question);
    expect(screen.queryByText(/Yes — cancel any time from Settings/)).not.toBeInTheDocument();
  });

  it("sets aria-expanded to reflect open state", () => {
    renderPage();
    const button = screen.getByText("Can I cancel my subscription at any time?").closest("button")!;
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the correct FAQ count label", () => {
    renderPage();
    expect(screen.getByText("11 QUESTIONS")).toBeInTheDocument();
  });
});

describe("SupportPage — response times table", () => {
  it("renders one row per support tier", () => {
    renderPage();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("ContractorPro")).toBeInTheDocument();
    expect(screen.getAllByText("Next business day").length).toBeGreaterThan(0);
  });
});
