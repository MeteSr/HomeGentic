/**
 * ApplianceLinks: the "Manual" and "Parts" links under a saved appliance on
 * the Rooms tab. They open a search in a new tab; nothing is saved or sent.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ApplianceLinks } from "@/components/ApplianceLinks";

describe("ApplianceLinks", () => {
  it("links to a manual search on the maker's site and a parts search, in a new tab", () => {
    render(<ApplianceLinks brand="Rheem" model="XE50T10H45U0" />);
    const manual = screen.getByRole("link", { name: /Manual/ });
    const parts = screen.getByRole("link", { name: /Parts/ });
    expect(manual.getAttribute("href")).toContain("site%3Arheem.com");
    expect(manual.getAttribute("title")).toBe("Search rheem.com for this model's manual");
    expect(parts.getAttribute("href")).toContain("replacement+parts");
    for (const a of [manual, parts]) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("renders nothing without a model number", () => {
    const { container } = render(<ApplianceLinks brand="Rheem" model="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
