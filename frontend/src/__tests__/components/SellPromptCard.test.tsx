/**
 * The dashboard's yearly "Thinking of selling?" card: shown for four weeks a
 * year per home, only where enough verified agents serve the city, and
 * dismissible until next year. The copy never promises a commission or a
 * saving: agents set their own terms and the seller chooses.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SellPromptCard } from "@/components/SellPromptCard";
import { sellPromptDismissKey, sellPromptWeek } from "@homegentic/shared/sellPrompt";

const m = vi.hoisted(() => ({ countVerifiedAgents: vi.fn() }));
vi.mock("@/services/agent", () => ({ agentService: m }));

const WEEK = 7 * 86_400_000;
const ID = "prop-7";
/** A moment inside the home's prompt week (2026). */
const IN_WINDOW = Date.UTC(2025, 11, 31, 12) + (sellPromptWeek(ID) - 1) * WEEK;
const OUT_OF_WINDOW = IN_WINDOW + 10 * WEEK;

const renderCard = (now: number) =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<SellPromptCard propertyId={ID} city="Orlando" now={now} />} />
        <Route path="/listing/new" element={<p>New listing page</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  m.countVerifiedAgents.mockReset();
  localStorage.clear();
});

describe("SellPromptCard", () => {
  it("in the home's weeks, with enough agents, says how many and links to Bid to List", async () => {
    m.countVerifiedAgents.mockResolvedValue([4]);
    renderCard(IN_WINDOW);
    expect(await screen.findByText(/thinking of selling\?/i)).toBeInTheDocument();
    expect(screen.getByText(/4 verified agents serve orlando/i)).toBeInTheDocument();
    expect(screen.getByText(/agents set their own terms, and you choose/i)).toBeInTheDocument();
    expect(m.countVerifiedAgents).toHaveBeenCalledWith(["Orlando"]);
    fireEvent.click(screen.getByRole("button", { name: /see how bid to list works/i }));
    expect(await screen.findByText("New listing page")).toBeInTheDocument();
  });

  it("stays hidden with too few agents, or outside the home's weeks (without asking)", async () => {
    m.countVerifiedAgents.mockResolvedValue([2]);
    const { container } = renderCard(IN_WINDOW);
    await waitFor(() => expect(m.countVerifiedAgents).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    m.countVerifiedAgents.mockClear();
    const out = renderCard(OUT_OF_WINDOW);
    expect(out.container).toBeEmptyDOMElement();
    expect(m.countVerifiedAgents).not.toHaveBeenCalled();
  });

  it("'Not now' hides it until next year", async () => {
    m.countVerifiedAgents.mockResolvedValue([5]);
    renderCard(IN_WINDOW);
    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    expect(screen.queryByText(/thinking of selling\?/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(sellPromptDismissKey(ID, IN_WINDOW))).toBe("1");

    m.countVerifiedAgents.mockClear();
    const again = renderCard(IN_WINDOW + WEEK);
    expect(again.container).toBeEmptyDOMElement();
    expect(m.countVerifiedAgents).not.toHaveBeenCalled();
  });
});
