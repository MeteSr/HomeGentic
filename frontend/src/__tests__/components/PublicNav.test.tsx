/**
 * PublicNav — real logic worth locking down:
 *   - the background darkens once the page has scrolled past 8px
 *   - the hamburger toggles the mobile dropdown open/closed, and shows
 *     the close (✕) glyph while open
 *   - the desktop CTA navigates to /login
 *   - a mobile nav-link click and the mobile CTA both close the dropdown;
 *     the mobile CTA also navigates to /login
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PublicNav } from "@/components/PublicNav";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderNav() {
  return render(<MemoryRouter><PublicNav /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
});

describe("PublicNav — scroll background", () => {
  it("uses the lighter background before scrolling and darkens past 8px", () => {
    const { container } = renderNav();
    const header = container.querySelector("header")!;
    expect(header).toHaveStyle({ background: "rgba(252,252,253,0.88)" });

    Object.defineProperty(window, "scrollY", { value: 20, configurable: true });
    fireEvent.scroll(window);

    expect(header).toHaveStyle({ background: "rgba(252,252,253,0.96)" });
  });
});

describe("PublicNav — desktop CTA", () => {
  it("navigates to /login", () => {
    renderNav();
    fireEvent.click(screen.getByText("Get Started Free"));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});

describe("PublicNav — mobile menu", () => {
  it("toggles the dropdown open and closed via the hamburger", () => {
    renderNav();
    const hamburger = screen.getByLabelText("Toggle menu");
    expect(hamburger).toHaveTextContent("☰");
    expect(screen.queryByText("Pricing", { selector: ".public-nav-mobile a" })).not.toBeInTheDocument();

    fireEvent.click(hamburger);
    expect(hamburger).toHaveTextContent("✕");
    const mobileMenu = document.querySelector(".public-nav-mobile")!;
    expect(within(mobileMenu as HTMLElement).getByText("Pricing")).toBeInTheDocument();

    fireEvent.click(hamburger);
    expect(hamburger).toHaveTextContent("☰");
    expect(document.querySelector(".public-nav-mobile")).not.toBeInTheDocument();
  });

  it("closes the dropdown when a mobile nav link is clicked", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    const mobileMenu = document.querySelector(".public-nav-mobile") as HTMLElement;
    fireEvent.click(within(mobileMenu).getByText("Support"));

    expect(document.querySelector(".public-nav-mobile")).not.toBeInTheDocument();
  });

  it("closes the dropdown and navigates via the mobile CTA", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    const mobileMenu = document.querySelector(".public-nav-mobile") as HTMLElement;
    fireEvent.click(within(mobileMenu).getByText("Get Started Free"));

    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(document.querySelector(".public-nav-mobile")).not.toBeInTheDocument();
  });
});
