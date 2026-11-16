/**
 * /sell — the public page that brings sellers who aren't users yet to Bid to
 * List. It explains how the auction works without promising a commission
 * level or a saving, checks whether enough verified agents serve the
 * visitor's city, and signs them up (or sends a signed-in owner straight to
 * a new listing).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SellPage from "@/pages/SellPage";

const m = vi.hoisted(() => ({ countVerifiedAgents: vi.fn(), auth: { isAuthenticated: false } }));
vi.mock("@/services/agent", () => ({ agentService: { countVerifiedAgents: m.countVerifiedAgents } }));
vi.mock("@/store/authStore", () => ({ useAuthStore: () => m.auth }));
vi.mock("@/components/PublicNav", () => ({ PublicNav: () => null }));
vi.mock("@/components/PublicFooter", () => ({ PublicFooter: () => null }));
vi.mock("@/components/PageHead", () => ({ PageHead: () => null }));

function Where() {
  const l = useLocation();
  return <p>At {l.pathname + l.search}</p>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/sell"]}>
      <Routes>
        <Route path="/sell" element={<SellPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const check = (city: string) => {
  fireEvent.change(screen.getByLabelText(/your city/i), { target: { value: city } });
  fireEvent.click(screen.getByRole("button", { name: /check my city/i }));
};

beforeEach(() => {
  m.countVerifiedAgents.mockReset();
  m.auth.isAuthenticated = false;
});

describe("SellPage", () => {
  it("explains Bid to List without promising a commission or a saving", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/agents compete/i);
    expect(screen.getByText(/agents set their own terms, and you choose/i)).toBeInTheDocument();
    expect(screen.getByText(/homegentic charges the winning agent, not you/i)).toBeInTheDocument();
    expect(screen.getByText(/your address stays hidden from agents until you pick one/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/guarantee|lower commission|save \$/i);
  });

  it("says how many verified agents serve the city and signs a visitor up", async () => {
    m.countVerifiedAgents.mockResolvedValue([5]);
    renderPage();
    check(" Orlando ");
    expect(await screen.findByText(/5 verified agents serve orlando/i)).toBeInTheDocument();
    expect(m.countVerifiedAgents).toHaveBeenCalledWith(["Orlando"]);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(await screen.findByText("At /login?redirect=%2Flisting%2Fnew")).toBeInTheDocument();
  });

  it("sends a signed-in owner straight to a new listing", async () => {
    m.auth.isAuthenticated = true;
    m.countVerifiedAgents.mockResolvedValue([3]);
    renderPage();
    check("Orlando");
    fireEvent.click(await screen.findByRole("button", { name: /get started/i }));
    expect(await screen.findByText("At /listing/new")).toBeInTheDocument();
  });

  it("says when a city isn't open yet, and why", async () => {
    m.countVerifiedAgents.mockResolvedValue([1]);
    renderPage();
    check("Tampa");
    expect(await screen.findByText(/bid to list isn't open in tampa yet/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 3 verified agents/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /get started/i })).not.toBeInTheDocument();
  });

  it("asks for a city first, and says so when the count can't be read", async () => {
    renderPage();
    check("  ");
    expect(m.countVerifiedAgents).not.toHaveBeenCalled();
    m.countVerifiedAgents.mockRejectedValue(new Error("down"));
    check("Orlando");
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't check orlando just now/i);
  });
});
