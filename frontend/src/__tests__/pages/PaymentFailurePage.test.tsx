/**
 * PaymentFailurePage — pure presentational page, previously untested.
 * Verifies the cancellation messaging renders and both recovery links
 * point where a cancelled-checkout user needs to go.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PaymentFailurePage from "@/pages/PaymentFailurePage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/payment-failure"]}>
      <PaymentFailurePage />
    </MemoryRouter>
  );
}

describe("PaymentFailurePage", () => {
  it("renders the cancellation message and reassures no charge was made", () => {
    renderPage();
    expect(screen.getByText(/payment cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/no charge was made/i)).toBeInTheDocument();
  });

  it("links back to pricing to retry", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /back to pricing/i })).toHaveAttribute("href", "/pricing");
  });

  it("links back to the dashboard", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /return to dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
