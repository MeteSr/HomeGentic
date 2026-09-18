/**
 * TermsOfServicePage — mostly static legal content; the real structural
 * logic worth locking down is the SECTIONS-driven rendering, mirroring
 * PrivacyPolicyPage's pattern.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TermsOfServicePage from "@/pages/TermsOfServicePage";

function renderPage() {
  return render(<MemoryRouter><TermsOfServicePage /></MemoryRouter>);
}

describe("TermsOfServicePage", () => {
  it("renders the page title and effective date", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText(/Effective date:/)).toBeInTheDocument();
  });

  it("renders a numbered heading for every section, in order", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.length).toBeGreaterThan(10);
    expect(headings[0]).toHaveTextContent("Acceptance of Terms");
    expect(headings[headings.length - 1]).toHaveTextContent("Contact Us");
  });

  it("renders a table of contents entry for every section", () => {
    renderPage();
    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    const links = within(toc).getAllByRole("link");
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(links.length).toBe(headings.length);
  });

  it("includes the AI-generated content disclaimer section", () => {
    renderPage();
    expect(screen.getByText("AI-Generated Content and Recommendations")).toBeInTheDocument();
  });
});
