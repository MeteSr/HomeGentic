/**
 * FAQPage — real logic worth locking down:
 *   - each FAQ starts collapsed, with the answer not rendered
 *   - clicking a question toggles ONLY its own answer, leaving
 *     siblings untouched
 *   - clicking an open question again collapses it
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FAQPage from "@/pages/FAQPage";

function renderPage() {
  return render(<MemoryRouter><FAQPage /></MemoryRouter>);
}

const Q1 = "How do I prove my home maintenance history to buyers?";
const A1 = /HomeGentic creates a blockchain-backed record/;
const Q2 = "What are home maintenance records and why do they matter for sale?";
const A2 = /Home maintenance records are documented proof/;

describe("FAQPage — collapsed by default", () => {
  it("does not render any answers until a question is clicked", () => {
    renderPage();
    expect(screen.getByText(Q1)).toBeInTheDocument();
    expect(screen.queryByText(A1)).not.toBeInTheDocument();
    expect(screen.queryByText(A2)).not.toBeInTheDocument();
  });
});

describe("FAQPage — toggle behavior", () => {
  it("expands only the clicked question's answer", () => {
    renderPage();
    fireEvent.click(screen.getByText(Q1));

    expect(screen.getByText(A1)).toBeInTheDocument();
    expect(screen.queryByText(A2)).not.toBeInTheDocument();
  });

  it("expanding a second question leaves the first expanded too (independent state)", () => {
    renderPage();
    fireEvent.click(screen.getByText(Q1));
    fireEvent.click(screen.getByText(Q2));

    expect(screen.getByText(A1)).toBeInTheDocument();
    expect(screen.getByText(A2)).toBeInTheDocument();
  });

  it("collapses an open question when clicked again", () => {
    renderPage();
    fireEvent.click(screen.getByText(Q1));
    expect(screen.getByText(A1)).toBeInTheDocument();

    fireEvent.click(screen.getByText(Q1));
    expect(screen.queryByText(A1)).not.toBeInTheDocument();
  });
});
