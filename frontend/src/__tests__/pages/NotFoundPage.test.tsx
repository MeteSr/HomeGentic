/**
 * NotFoundPage — unknown URLs get a real "page not found" instead of a silent
 * redirect to the landing page, with a way back that fits who's signed in.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import NotFoundPage from "@/pages/NotFoundPage";
import { useAuthStore } from "@/store/authStore";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>
  );
}

function signIn(role: string | null) {
  useAuthStore.setState({ isAuthenticated: role !== null, profile: role ? ({ role } as any) : null });
}

afterEach(() => signIn(null));

describe("NotFoundPage", () => {
  it("says the page wasn't found and shows the path that was asked for", () => {
    renderAt("/property/1");
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("/property/1")).toBeInTheDocument();
  });

  it("sends signed-out visitors to the home page", () => {
    renderAt("/nope");
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });

  it("sends a signed-in homeowner to the dashboard", () => {
    signIn("Homeowner");
    renderAt("/nope");
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("sends a contractor to the contractor dashboard", () => {
    signIn("Contractor");
    renderAt("/nope");
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/contractor-dashboard");
  });

  it("links to support", () => {
    renderAt("/nope");
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
  });
});
