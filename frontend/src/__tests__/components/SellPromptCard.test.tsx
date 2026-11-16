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
import { sellPromptDismissKey, sellPromptMoveKey, sellPromptWeek } from "@homegentic/shared/sellPrompt";

const m = vi.hoisted(() => ({ countVerifiedAgents: vi.fn(), getLoan: vi.fn(), getStateHpi: vi.fn() }));
vi.mock("@/services/agent", () => ({ agentService: { countVerifiedAgents: m.countVerifiedAgents } }));
vi.mock("@/services/mortgageLoan", () => ({ mortgageLoanService: { get: m.getLoan } }));
vi.mock("@/services/homeValueIndex", () => ({ getStateHpi: m.getStateHpi }));

const WEEK = 7 * 86_400_000;
const ID = "prop-7";
/** A moment inside the home's prompt week (2026). */
const IN_WINDOW = Date.UTC(2025, 11, 31, 12) + (sellPromptWeek(ID) - 1) * WEEK;
const OUT_OF_WINDOW = IN_WINDOW + 10 * WEEK;

type Extra = Partial<Pick<React.ComponentProps<typeof SellPromptCard>, "score" | "scoreHistory" | "state">>;

const renderCard = (now: number, extra: Extra = {}) =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="/dashboard"
          element={<SellPromptCard propertyId={ID} city="Orlando" state="FL" score={0} scoreHistory={[]} now={now} {...extra} />}
        />
        <Route path="/listing/new" element={<p>New listing page</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  m.countVerifiedAgents.mockReset();
  m.getLoan.mockReset().mockResolvedValue(null);
  m.getStateHpi.mockReset().mockResolvedValue(null);
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

describe("SellPromptCard when the score or home value moves", () => {
  const DAY = 86_400_000;
  const now = OUT_OF_WINDOW;
  const history = [
    { score: 61, timestamp: now - 70 * DAY },
    { score: 74, timestamp: now },
  ];
  const loan = { originalValue: 300_000, firstPaymentDate: "2024-02-01" };
  // Up 6% over the last four quarters; 300,000 × 106 / 90 ≈ $353,000 since the loan.
  const hpi = [
    [2024, 1, 90],
    [2025, 3, 100],
    [2026, 3, 106],
  ];

  it("shows outside the yearly weeks when the score rose enough, and says by how much", async () => {
    m.countVerifiedAgents.mockResolvedValue([4]);
    renderCard(now, { score: 74, scoreHistory: history });
    expect(await screen.findByText(/thinking of selling\?/i)).toBeInTheDocument();
    expect(screen.getByText(/your homegentic score went from 61 to 74 since/i)).toBeInTheDocument();
    expect(screen.getByText(/4 verified agents serve orlando/i)).toBeInTheDocument();
  });

  it("shows when the index estimate rose enough, naming the state, the quarters and the estimate", async () => {
    m.countVerifiedAgents.mockResolvedValue([4]);
    m.getLoan.mockResolvedValue(loan);
    m.getStateHpi.mockResolvedValue(hpi);
    renderCard(now);
    expect(
      await screen.findByText(
        /home prices in FL rose 6% from Q3 2025 to Q3 2026, which puts the index estimate on your mortgage card at \$353,000/i,
      ),
    ).toBeInTheDocument();
    expect(m.getLoan).toHaveBeenCalledWith(ID);
    expect(m.getStateHpi).toHaveBeenCalledWith("FL");
  });

  it("stays hidden on a small move, and doesn't ask for agents", async () => {
    m.getLoan.mockResolvedValue(loan);
    m.getStateHpi.mockResolvedValue([[2024, 1, 90], [2025, 3, 100], [2026, 3, 103]]);
    const { container } = renderCard(now, { score: 70, scoreHistory: [{ score: 61, timestamp: now - 70 * DAY }] });
    await waitFor(() => expect(m.getStateHpi).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(m.countVerifiedAgents).not.toHaveBeenCalled();
  });

  it("'Not now' remembers the score and value, so only a further move brings it back", async () => {
    m.countVerifiedAgents.mockResolvedValue([4]);
    m.getLoan.mockResolvedValue(loan);
    m.getStateHpi.mockResolvedValue(hpi);
    const first = renderCard(now, { score: 74, scoreHistory: history });
    fireEvent.click(await screen.findByRole("button", { name: /not now/i }));
    expect(JSON.parse(localStorage.getItem(sellPromptMoveKey(ID)) ?? "{}")).toEqual({ score: 74, value: 353_000 });
    first.unmount();

    const again = renderCard(now + DAY, { score: 76, scoreHistory: history });
    await waitFor(() => expect(m.getStateHpi).toHaveBeenCalledTimes(2));
    expect(again.container).toBeEmptyDOMElement();
    again.unmount();

    renderCard(now + DAY, { score: 84, scoreHistory: history });
    expect(await screen.findByText(/went from 61 to 84/i)).toBeInTheDocument();
  });

  it("a failed loan or index lookup leaves just the score check", async () => {
    m.getLoan.mockRejectedValue(new Error("down"));
    const { container } = renderCard(now);
    await waitFor(() => expect(m.getLoan).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
