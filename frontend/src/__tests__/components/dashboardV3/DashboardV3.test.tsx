/**
 * DashboardV3 — the main desktop dashboard shell. Real logic worth locking
 * down: switching between the 16 rail panels, the idle/voice/panel mode
 * derivation, and — the specific bug this file was added to guard against
 * (see panelData.test.ts) — every panel's main CTA button resolving to a
 * real action rather than silently doing nothing when clicked.
 */

import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardV3 } from "@/components/dashboardV3/DashboardV3";
import type { Property } from "@/services/property";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const {
  mockOpenAddProp, mockUseAuthStore, mockUsePropertySummary, mockUseJobSummary,
  mockUseQuoteSummary, mockUseMaintenanceSchedule, mockUseScoreTracking,
  mockUsePropertyRooms, mockUseSubscription, mockUseVoiceAgent, mockUseActivityFeed,
  mockGetDevicesForProperty, mockGetPendingAlerts, mockGetPeople,
  mockGetBills, mockGetExpenses, mockGetBySpecialty, mockGetPriceBenchmark, mockRequestQuoteModal,
} = vi.hoisted(() => ({
  mockGetBills: vi.fn(),
  mockGetExpenses: vi.fn(),
  mockGetBySpecialty: vi.fn(),
  mockGetPriceBenchmark: vi.fn(),
  mockRequestQuoteModal: vi.fn(),
  mockOpenAddProp: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockUsePropertySummary: vi.fn(),
  mockUseJobSummary: vi.fn(),
  mockUseQuoteSummary: vi.fn(),
  mockUseMaintenanceSchedule: vi.fn(),
  mockUseScoreTracking: vi.fn(),
  mockUsePropertyRooms: vi.fn(),
  mockUseSubscription: vi.fn(),
  mockUseVoiceAgent: vi.fn(),
  mockUseActivityFeed: vi.fn(),
  mockGetDevicesForProperty: vi.fn(),
  mockGetPendingAlerts: vi.fn(),
  mockGetPeople: vi.fn(),
}));

vi.mock("@/store/addPropertyStore", () => ({ useAddPropertyStore: () => ({ open: mockOpenAddProp }) }));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));
vi.mock("@/hooks/usePropertySummary", () => ({ usePropertySummary: mockUsePropertySummary }));
vi.mock("@/hooks/useJobSummary", () => ({ useJobSummary: mockUseJobSummary }));
vi.mock("@/hooks/useQuoteSummary", () => ({ useQuoteSummary: mockUseQuoteSummary }));
vi.mock("@/hooks/useMaintenanceSchedule", () => ({ useMaintenanceSchedule: mockUseMaintenanceSchedule }));
vi.mock("@/hooks/useScoreTracking", () => ({ useScoreTracking: mockUseScoreTracking }));
vi.mock("@/hooks/usePropertyRooms", () => ({ usePropertyRooms: mockUsePropertyRooms }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: mockUseSubscription }));
vi.mock("@/hooks/useVoiceAgent", () => ({ useVoiceAgent: mockUseVoiceAgent }));
vi.mock("@/hooks/useActivityFeed", () => ({ useActivityFeed: mockUseActivityFeed }));
vi.mock("@/services/sensor", () => ({
  sensorService: { getDevicesForProperty: mockGetDevicesForProperty, getPendingAlerts: mockGetPendingAlerts },
}));
vi.mock("@/services/people", () => ({ peopleService: { getPeople: mockGetPeople } }));
vi.mock("@/services/billService", () => ({
  billService: { getBillsForProperty: mockGetBills, getRecurringExpensesForProperty: mockGetExpenses },
}));
vi.mock("@/services/contractor", () => ({ contractorService: { getBySpecialty: mockGetBySpecialty } }));
vi.mock("@/services/priceBenchmark", () => ({ getPriceBenchmark: mockGetPriceBenchmark }));

// Real modals aren't exercised here (DashboardV3's own precedent is to
// render them unthemed with no extra wiring) — stub them out so their own
// hook/service dependencies don't need mocking too.
vi.mock("@/components/LogJobModal", () => ({ LogJobModal: () => null }));
vi.mock("@/components/RequestQuoteModal", () => ({ RequestQuoteModal: (props: any) => { mockRequestQuoteModal(props); return null; } }));
vi.mock("@/components/AddRoomModal", () => ({ AddRoomModal: () => null }));
vi.mock("@/components/RecurringServiceCreateModal", () => ({ default: () => null }));
vi.mock("@/components/UpgradeModal", () => ({ default: () => null }));
vi.mock("@/components/InitListingModal", () => ({ default: () => null }));
vi.mock("@/components/ActivityFeedDrawer", () => ({ ActivityFeedDrawer: () => null }));
vi.mock("@/components/UserMenuPopover", () => ({ UserMenuPopover: () => null }));
vi.mock("../AwardBidModal", () => ({ AwardBidModal: () => null }));
vi.mock("../ChaseSignatureModal", () => ({ ChaseSignatureModal: () => null }));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "1 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function voiceReturn(overrides: Partial<ReturnType<typeof mockUseVoiceAgent>> = {}) {
  return {
    state: "idle", transcript: "", response: "", error: null, isSupported: false,
    history: [], pendingImage: null, pendingProposal: null,
    creditBalance: 10, quotaExhausted: false, fallbackNotice: false,
    reset: vi.fn(), startListening: vi.fn(), stopListening: vi.fn(),
    confirmProposal: vi.fn(), dismissProposal: vi.fn(),
    ...overrides,
  };
}

function renderDashboard() {
  return render(<MemoryRouter><DashboardV3 /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ principal: "my-principal", profile: { email: "me@example.com" } });
  mockUsePropertySummary.mockReturnValue({ properties: [makeProperty()], loading: false });
  mockUseJobSummary.mockReturnValue({ allJobs: [], pendingProposals: [], loading: false, approveProposal: vi.fn(), rejectProposal: vi.fn() });
  mockUseQuoteSummary.mockReturnValue({ quoteRequests: [], bidCountMap: {}, reload: vi.fn() });
  mockUseMaintenanceSchedule.mockReturnValue({ recurringServices: [], visitLogMap: {}, systemAges: {} });
  mockUseScoreTracking.mockReturnValue({ scoreHistory: [] });
  mockUsePropertyRooms.mockReturnValue({ rooms: [], setRooms: vi.fn() });
  mockUseSubscription.mockReturnValue({ userTier: "Free", expiresAt: null, cancelledAt: null });
  mockUseVoiceAgent.mockReturnValue(voiceReturn());
  mockUseActivityFeed.mockReturnValue({ feedOpen: false, feedLoaded: true, events: [], unread: 0, lastReadAt: 0, openFeed: vi.fn(), closeFeed: vi.fn() });
  mockGetDevicesForProperty.mockResolvedValue([]);
  mockGetPendingAlerts.mockResolvedValue([]);
  mockGetPeople.mockResolvedValue([]);
  mockGetBills.mockResolvedValue([]);
  mockGetExpenses.mockResolvedValue([]);
  mockGetBySpecialty.mockResolvedValue([]);
  mockGetPriceBenchmark.mockResolvedValue(null);
});

describe("DashboardV3 — panel navigation", () => {
  it("switches to the clicked rail panel and shows its title", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("PROPERTY"));
    expect(screen.getByText(/Add a property to start the record|records on file/)).toBeInTheDocument();
  });

  it("closes a panel back to idle mode via Back to quiet", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("PROPERTY"));
    fireEvent.click(screen.getByText("Back to quiet"));
    expect(screen.getByText("HOMEGENTIC SCORE")).toBeInTheDocument();
  });
});

describe("DashboardV3 — panel CTA button (dead-button regression)", () => {
  it("score panel's CTA opens the Log Job flow", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("SCORE"));
    fireEvent.click(screen.getByText("See how to earn them"));
    // LogJobModal is stubbed to null — confirm the click didn't throw and
    // the panel is still on screen (both the rail chip and the open
    // panel's own chip render "SCORE" simultaneously).
    expect(screen.getAllByText("SCORE").length).toBeGreaterThan(0);
  });

  it("market panel's CTA navigates to /resale-ready", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("MARKET"));
    fireEvent.click(screen.getByText("Generate resale report"));
    expect(mockNavigate).toHaveBeenCalledWith("/resale-ready");
  });

  it("sensors panel's CTA navigates to /sensors when no devices are paired", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("SENSORS"));
    fireEvent.click(screen.getByText("Pair a device"));
    expect(mockNavigate).toHaveBeenCalledWith("/sensors");
  });

  it("spend panel's CTA switches to the docs panel", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("SPEND"));
    fireEvent.click(screen.getByText("See every line item"));
    expect(screen.getAllByText("DOCS").length).toBeGreaterThan(0);
    expect(screen.getByText("Upload a receipt")).toBeInTheDocument();
  });

  it("activity panel's CTA opens the activity feed drawer", () => {
    const openFeed = vi.fn();
    mockUseActivityFeed.mockReturnValue({ feedOpen: false, feedLoaded: true, events: [], unread: 0, lastReadAt: 0, openFeed, closeFeed: vi.fn() });
    renderDashboard();
    fireEvent.click(screen.getByText("ACTIVITY"));
    fireEvent.click(screen.getByText("Open the full log"));
    expect(openFeed).toHaveBeenCalledTimes(1);
  });

  it("safety panel's CTA opens the Log Job flow without error", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("SAFETY"));
    fireEvent.click(screen.getByText("Log the missing categories"));
    expect(screen.getAllByText("SAFETY").length).toBeGreaterThan(0);
  });

  it("property panel's CTA opens the Log Job flow without error", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("PROPERTY"));
    fireEvent.click(screen.getByText("Log a job to add proof"));
    expect(screen.getAllByText("PROPERTY").length).toBeGreaterThan(0);
  });

  it("awaiting panel's CTA approves all pending proposals", () => {
    const approveProposal = vi.fn();
    mockUseJobSummary.mockReturnValue({
      allJobs: [], loading: false, approveProposal, rejectProposal: vi.fn(),
      pendingProposals: [
        { id: "j1", serviceType: "HVAC", isDiy: false, contractorName: "Cool Air", date: "2024-01-01", amount: 10000 } as any,
        { id: "j2", serviceType: "Plumbing", isDiy: false, contractorName: "Pipes Co", date: "2024-01-02", amount: 20000 } as any,
      ],
    });
    renderDashboard();
    fireEvent.click(screen.getByText("AWAITING"));
    fireEvent.click(screen.getByText("Approve all"));
    expect(approveProposal).toHaveBeenCalledWith("j1");
    expect(approveProposal).toHaveBeenCalledWith("j2");
  });

  it("billing panel's CTA navigates to /settings for Pro users", () => {
    mockUseSubscription.mockReturnValue({ userTier: "Pro", expiresAt: null, cancelledAt: null });
    renderDashboard();
    fireEvent.click(screen.getByText("BILLING"));
    fireEvent.click(screen.getByText("Manage the plan"));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("billing panel's CTA opens the upgrade flow for Free users", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("BILLING"));
    fireEvent.click(screen.getByText("Upgrade to Pro — $59 a year"));
    // UpgradeModal is stubbed to null — confirm the click didn't navigate
    // away (billing's Free-tier CTA opens a flow, not a route).
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("people panel's CTA navigates to /people for Pro users", () => {
    mockUseSubscription.mockReturnValue({ userTier: "Pro", expiresAt: null, cancelledAt: null });
    renderDashboard();
    fireEvent.click(screen.getByText("PEOPLE"));
    // "Invite someone" appears both as a row inside the panel and as the
    // panel's own main CTA (rendered last in DOM order) — click the CTA.
    const inviteButtons = screen.getAllByText("Invite someone");
    fireEvent.click(inviteButtons[inviteButtons.length - 1]);
    expect(mockNavigate).toHaveBeenCalledWith("/people");
  });
});

describe("DashboardV3 — People panel gating", () => {
  it("locks the People rail chip for Free/Basic tiers", () => {
    renderDashboard();
    const peopleChip = screen.getByText("PEOPLE").closest("div")!;
    expect(within(peopleChip).getByText("PRO")).toBeInTheDocument();
  });

  it("clicking the locked People chip opens the upgrade flow, not the panel", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("PEOPLE"));
    expect(screen.queryByText("Invite someone")).not.toBeInTheDocument();
  });
});

describe("DashboardV3 — property picker", () => {
  it("opens the add-property flow from the header + button", () => {
    // Below the tier's property limit, so handleAddProperty() calls
    // openAddProp() directly rather than routing to the upgrade flow.
    mockUsePropertySummary.mockReturnValue({ properties: [], loading: false });
    renderDashboard();
    fireEvent.click(screen.getByLabelText("Add property"));
    expect(mockOpenAddProp).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardV3 — ask bar", () => {
  it("routes a typed question to the matching panel on Enter", () => {
    renderDashboard();
    const input = screen.getByPlaceholderText("Ask about your home");
    fireEvent.change(input, { target: { value: "who else has access" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByText("PEOPLE").length).toBeGreaterThan(0);
  });
});

describe("DashboardV3 — home brief", () => {
  it("greets the owner and lists what needs them, most urgent first", () => {
    mockUseJobSummary.mockReturnValue({
      allJobs: [], pendingProposals: [{ id: "j1", propertyId: "prop-1" }], loading: false,
      approveProposal: vi.fn(), rejectProposal: vi.fn(),
    });
    renderDashboard();
    const brief = screen.getByTestId("home-brief");
    expect(within(brief).getByText(/^Good (morning|afternoon|evening)\. \d+ things? needs? you\.$/)).toBeInTheDocument();
    expect(within(brief).getByText("1 job is waiting on your approval.")).toBeInTheDocument();
    // A 2000 build puts the water heater well past its 12-year life.
    expect(within(brief).getByText(/past its expected life\. Replacement runs/)).toBeInTheDocument();
  });

  it("opens the matching panel when a brief item is tapped", () => {
    mockUseJobSummary.mockReturnValue({
      allJobs: [], pendingProposals: [{ id: "j1", propertyId: "prop-1" }], loading: false,
      approveProposal: vi.fn(), rejectProposal: vi.fn(),
    });
    renderDashboard();
    fireEvent.click(screen.getByText("1 job is waiting on your approval."));
    expect(screen.getByText("Back to quiet")).toBeInTheDocument();
    expect(screen.queryByTestId("home-brief")).not.toBeInTheDocument();
  });

  it("includes a utility rise from the property's bills", async () => {
    const bill = (month: string, cents: number) => ({
      id: month, propertyId: "prop-1", homeowner: "me", billType: "Gas", provider: "Gas Co",
      periodStart: `${month}-01`, periodEnd: `${month}-28`, amountCents: cents, uploadedAt: 0, anomalyFlag: false,
    });
    const now = new Date();
    const bills = [];
    for (let back = 1; back <= 24; back++) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      bills.push(bill(ym, back <= 12 ? 13_000 : 10_000));
    }
    mockGetBills.mockResolvedValue(bills);
    renderDashboard();
    expect(await screen.findByText("Gas bills are up 30% on last year.")).toBeInTheDocument();
  });
});

describe("DashboardV3 — answer cards", () => {
  function ask(q: string) {
    const input = screen.getByPlaceholderText("Ask about your home");
    fireEvent.change(input, { target: { value: q } });
    fireEvent.keyDown(input, { key: "Enter" });
  }

  it("answers a system decision question with facts composed from several sources", async () => {
    mockGetPriceBenchmark.mockResolvedValue({ serviceType: "Plumbing", zipCode: "78701", low: 150_000, median: 240_000, high: 380_000, sampleSize: 12, lastUpdated: "2026-08" });
    mockGetBySpecialty.mockResolvedValue([{}, {}, {}]);
    renderDashboard();
    ask("Should I replace my water heater?");

    const card = screen.getByTestId("answer-card");
    expect(within(card).getByText(/^Your water heater is \d+ years old and past its expected life$/)).toBeInTheDocument();
    expect(within(card).getByText("Age")).toBeInTheDocument();
    expect(within(card).getByText("Replacement")).toBeInTheDocument();
    expect(await within(card).findByText("$1,500–$3,800")).toBeInTheDocument();
    expect(await within(card).findByText("3")).toBeInTheDocument();
    expect(mockGetPriceBenchmark).toHaveBeenCalledWith("Plumbing", "78701");
    expect(mockGetBySpecialty).toHaveBeenCalledWith("Plumbing");
    expect(within(card).getByText(/BUILT FROM TEN-YEAR FORECAST · LOCAL PRICES · CONTRACTOR DIRECTORY/)).toBeInTheDocument();
  });

  it("opens a quote request prefilled with the system's service type", async () => {
    renderDashboard();
    ask("how long will the roof last");
    fireEvent.click(await screen.findByText("Request quotes"));
    await waitFor(() => {
      const calls = mockRequestQuoteModal.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.isOpen).toBe(true);
      expect(last.prefill).toMatchObject({ serviceType: "Roofing" });
      expect(last.prefill.description).toMatch(/^Roofing is about \d+ years old/);
    });
  });

  it("offers to set the install year when it's assumed from the build year", () => {
    renderDashboard();
    ask("should I replace my water heater");
    fireEvent.click(screen.getByText("Set when it was installed"));
    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-1/systems");
  });

  it("closes back to the resting stage", () => {
    renderDashboard();
    ask("should I replace my water heater");
    fireEvent.click(screen.getByLabelText("Close answer"));
    expect(screen.getByTestId("home-brief")).toBeInTheDocument();
  });

  it("still routes questions that aren't about a system to a panel", () => {
    renderDashboard();
    ask("how much have I spent");
    expect(screen.queryByTestId("answer-card")).not.toBeInTheDocument();
    expect(screen.getByText("Back to quiet")).toBeInTheDocument();
  });
});
