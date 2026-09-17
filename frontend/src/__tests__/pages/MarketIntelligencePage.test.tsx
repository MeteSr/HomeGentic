/**
 * MarketIntelligencePage — real logic worth locking down:
 *   - auto-selects the first property when properties load
 *   - Run Analysis parses the budget field to cents, defaulting invalid
 *     input to 0, and fetches jobs for the selected + comparison properties
 *   - empty state before any analysis has run
 *   - "View recommended projects" switches from the competitive to the
 *     projects tab
 *   - projects sort by ROI (desc), cost (asc), and payback (asc)
 *   - empty-projects state when nothing fits the budget
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MarketIntelligencePage from "@/pages/MarketIntelligencePage";
import type { CompetitiveAnalysis, ProjectRecommendation } from "@/services/market";
import type { Property } from "@/services/property";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetByProperty, mockGetAll } = vi.hoisted(() => ({
  mockGetByProperty: vi.fn(),
  mockGetAll:        vi.fn(),
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getByProperty: mockGetByProperty, getAll: mockGetAll } };
});

const { mockAnalyze, mockRecommend } = vi.hoisted(() => ({
  mockAnalyze:   vi.fn(),
  mockRecommend: vi.fn(),
}));
vi.mock("@/services/market", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/market")>();
  return {
    ...actual,
    marketService: {
      ...actual.marketService,
      analyzeCompetitivePosition: mockAnalyze,
      recommendValueAddingProjects: mockRecommend,
    },
  };
});

const STABLE_PROPS: Property[] = [
  {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
  },
  {
    id: "prop-2", owner: "p-owner", address: "456 Oak Ave", city: "Austin", state: "TX",
    zipCode: "78702", propertyType: "SingleFamily" as any, yearBuilt: 1995n, squareFeet: 1800n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
  },
];
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: STABLE_PROPS }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

function makeAnalysis(overrides: Partial<CompetitiveAnalysis> = {}): CompetitiveAnalysis {
  return {
    maintenanceScore: { score: 80, grade: "B", detail: "4/6 systems" },
    systemModernization: { score: 70, grade: "C", detail: "modernized" },
    verificationDepth: { score: 90, grade: "A", detail: "verified" },
    overallScore: 82, overallGrade: "B", rankOutOf: 2, totalCompared: 5,
    strengths: ["Recently updated HVAC"], improvements: ["Roof is aging"],
    ...overrides,
  } as CompetitiveAnalysis;
}

function makeProject(overrides: Partial<ProjectRecommendation> = {}): ProjectRecommendation {
  return {
    name: "Kitchen refresh", category: "Kitchen", estimatedCostCents: 1_000_000,
    estimatedRoiPercent: 60, estimatedGainCents: 600_000, paybackMonths: 24,
    priority: "Medium", rationale: "Improves resale appeal", requiresPermit: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MarketIntelligencePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetByProperty.mockResolvedValue([]);
  mockGetAll.mockResolvedValue([]);
  mockAnalyze.mockReturnValue(makeAnalysis());
  mockRecommend.mockReturnValue([]);
});

describe("MarketIntelligencePage — initial state", () => {
  it("shows the empty state before any analysis has run", () => {
    renderPage();
    expect(screen.getByText("Select a property and run analysis")).toBeInTheDocument();
  });

  it("auto-selects the first property", () => {
    renderPage();
    expect(screen.getByLabelText("Property")).toHaveValue("prop-1");
  });
});

describe("MarketIntelligencePage — run analysis", () => {
  it("fetches jobs for the selected property and all comparison properties", async () => {
    renderPage();
    fireEvent.click(screen.getByText("Run Analysis"));

    await waitFor(() => expect(mockGetByProperty).toHaveBeenCalledWith("prop-1"));
    expect(mockGetAll).toHaveBeenCalled();
    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
  });

  it("parses the budget field to cents for the recommendation call", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Max Budget"), { target: { value: "250" } });
    fireEvent.click(screen.getByText("Run Analysis"));

    await waitFor(() => expect(mockRecommend).toHaveBeenCalledWith(
      expect.any(Object), expect.any(Array), 25000
    ));
  });

  it("defaults to a 0-cent budget when the field is not a valid number", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Max Budget"), { target: { value: "not-a-number" } });
    fireEvent.click(screen.getByText("Run Analysis"));

    await waitFor(() => expect(mockRecommend).toHaveBeenCalledWith(
      expect.any(Object), expect.any(Array), 0
    ));
  });

  it("shows the competitive analysis results after running", async () => {
    mockAnalyze.mockReturnValue(makeAnalysis({ overallScore: 91, overallGrade: "A", rankOutOf: 1, totalCompared: 4 }));
    renderPage();
    fireEvent.click(screen.getByText("Run Analysis"));

    await waitFor(() => expect(screen.getByText("91")).toBeInTheDocument());
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Recently updated HVAC", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Roof is aging", { exact: false })).toBeInTheDocument();
  });

  it("hides the strengths/improvements panels when there are none", async () => {
    mockAnalyze.mockReturnValue(makeAnalysis({ strengths: [], improvements: [] }));
    renderPage();
    fireEvent.click(screen.getByText("Run Analysis"));

    await waitFor(() => expect(screen.getByText("Overall HomeGentic Score")).toBeInTheDocument());
    expect(screen.queryByText("Strengths")).not.toBeInTheDocument();
    expect(screen.queryByText("Improvement Opportunities")).not.toBeInTheDocument();
  });
});

describe("MarketIntelligencePage — projects tab", () => {
  async function runAndGoToProjects() {
    renderPage();
    fireEvent.click(screen.getByText("Run Analysis"));
    await waitFor(() => expect(screen.getByText("View recommended projects")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View recommended projects"));
  }

  it("shows the empty-projects state when nothing is recommended", async () => {
    mockRecommend.mockReturnValue([]);
    await runAndGoToProjects();
    await waitFor(() => expect(screen.getByText(/No projects fit your budget/)).toBeInTheDocument());
  });

  it("sorts projects by ROI descending by default", async () => {
    mockRecommend.mockReturnValue([
      makeProject({ name: "Low ROI", estimatedRoiPercent: 20 }),
      makeProject({ name: "High ROI", estimatedRoiPercent: 80 }),
    ]);
    await runAndGoToProjects();

    await waitFor(() => expect(screen.getByText("Low ROI")).toBeInTheDocument());
    const names = screen.getAllByText(/High ROI|Low ROI/).map((el) => el.textContent);
    expect(names[0]).toBe("High ROI");
    expect(names[1]).toBe("Low ROI");
  });

  it("re-sorts by cost ascending when that tab is clicked", async () => {
    mockRecommend.mockReturnValue([
      makeProject({ name: "Expensive", estimatedCostCents: 2_000_000 }),
      makeProject({ name: "Cheap", estimatedCostCents: 500_000 }),
    ]);
    await runAndGoToProjects();
    await waitFor(() => expect(screen.getByText("Expensive")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Cost ↑"));

    const names = screen.getAllByText(/Expensive|Cheap/).map((el) => el.textContent);
    expect(names[0]).toBe("Cheap");
    expect(names[1]).toBe("Expensive");
  });

  it("re-sorts by payback ascending when that tab is clicked", async () => {
    mockRecommend.mockReturnValue([
      makeProject({ name: "Slow payback", paybackMonths: 48 }),
      makeProject({ name: "Fast payback", paybackMonths: 6 }),
    ]);
    await runAndGoToProjects();
    await waitFor(() => expect(screen.getByText("Slow payback")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Payback ↑"));

    const names = screen.getAllByText(/Slow payback|Fast payback/).map((el) => el.textContent);
    expect(names[0]).toBe("Fast payback");
    expect(names[1]).toBe("Slow payback");
  });

  it("navigates to /quotes/new when Request Quote is clicked on a project", async () => {
    mockRecommend.mockReturnValue([makeProject({ name: "Kitchen refresh" })]);
    await runAndGoToProjects();
    await waitFor(() => expect(screen.getByText("Kitchen refresh")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Request Quote"));
    expect(mockNavigate).toHaveBeenCalledWith("/quotes/new");
  });
});
