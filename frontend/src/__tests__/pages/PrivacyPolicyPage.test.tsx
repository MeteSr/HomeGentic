/**
 * PrivacyPolicyPage — mostly static legal content; the real structural
 * logic worth locking down is the SECTIONS-driven rendering:
 *   - every section renders with a numbered heading, in order
 *   - the table of contents has one link per section, matching titles
 *   - the footer year/links render
 */

import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";

function renderPage() {
  return render(<MemoryRouter><PrivacyPolicyPage /></MemoryRouter>);
}

describe("PrivacyPolicyPage", () => {
  it("renders the page title and effective date", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/Effective date:/)).toBeInTheDocument();
  });

  it("renders a numbered heading for every section, in order", () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.length).toBeGreaterThan(10);
    expect(headings[0]).toHaveTextContent("Overview");
    expect(headings[headings.length - 1]).toHaveTextContent("Contact Us");
  });

  it("renders a table of contents entry for every section", () => {
    renderPage();
    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    const links = within(toc).getAllByRole("link");
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(links.length).toBe(headings.length);
  });

  it("links each TOC entry to its section anchor", () => {
    renderPage();
    const toc = screen.getByRole("navigation", { name: "Table of contents" });
    const firstLink = within(toc).getAllByRole("link")[0];
    expect(firstLink).toHaveAttribute("href", "#overview");
  });
});
