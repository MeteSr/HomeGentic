/**
 * Mobile v3 — render smoke test of the real navigators with canister calls mocked.
 *
 * NAV.1  homeowner (Free) sees Home / Property / Jobs / Upkeep / Account and each tab renders
 * NAV.2  Free shows the shared-access upgrade gate; Pro shows the people list
 * NAV.3  contractor sees Leads / Sign / Earnings / Account with fees computed
 * NAV.4  the assistant button opens the sheet with role-specific prompts
 * NAV.5  plan card opens the web hand-off screen
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockRole: "Homeowner" | "Contractor" = "Homeowner";
let mockTier: "Free" | "Pro" | "ContractorFree" | "ContractorPro" = "Free";

jest.mock("../../auth/AuthContext", () => ({
  useAuthContext: () => ({
    authState: { status: "authenticated", principal: "p-1", profile: { role: mockRole, email: "dana.mireles@example.com" } },
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => {}),
}));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

jest.mock("../../services/agentSession", () => ({
  getAgentSessionToken: jest.fn(async () => "hgs_test"),
  clearAgentSession: jest.fn(),
}));

jest.mock("../../services/planService", () => {
  const actual = jest.requireActual("../../services/planService");
  return { ...actual, getMySubscription: jest.fn(async () => ({ tier: mockTier, expiresAt: 0, cancelled: false })) };
});

jest.mock("../../services/agentService", () => {
  const actual = jest.requireActual("../../services/agentService");
  return { ...actual, getAgentUsage: jest.fn(async () => ({ used: 4, limit: 10, period: "week" })), callAgent: jest.fn() };
});

const mockProperty = {
  id: "p1", address: "412 Grandview Ave, Daytona Beach, FL 32118", street: "412 Grandview Ave", city: "Daytona Beach",
  state: "FL", zipCode: "32118", propertyType: "SingleFamily", yearBuilt: 1961, squareFeet: 2140,
  verificationLevel: "Premium", verificationMethod: "DeedRecord", score: 0, scoreGrade: "-",
};

jest.mock("../../services/propertyService", () => {
  const actual = jest.requireActual("../../services/propertyService");
  return {
    ...actual,
    getProperties: jest.fn(async () => [mockProperty]),
    getRooms: jest.fn(async () => [{ id: "r1", name: "Kitchen", floorName: "1", fixtures: [{ brand: "GE", model: "X", installedDate: "2020-01-01", warrantyExpiry: "" }] }]),
    getManagers: jest.fn(async () => [{ principal: "aaaaa-aa", role: "Manager", displayName: "Marcus Dean", addedAt: 0, spendLimitCents: 50_000 }]),
    getApprovals: jest.fn(async () => []),
    getOwnerNotifications: jest.fn(async () => [{ id: 1, managerName: "Marcus Dean", description: "Moved gutter cleaning to Aug 21", timestamp: 0, seen: false }]),
    getStreetAddresses: jest.fn(async () => ({ p1: "412 Grandview Ave" })),
  };
});

const mockJob = {
  id: "j1", propertyId: "p1", serviceType: "Roofing", description: "Soffit repair", amountCents: 124_000,
  completedDate: new Date().toISOString().slice(0, 10), status: "verified", isDiy: false, contractorName: "Bell & Sons",
  verified: true, homeownerSigned: true, contractorSigned: true, sourceQuoteId: "q1",
};

jest.mock("../../services/jobService", () => ({
  getJobs: jest.fn(async () => [mockJob]),
  getJobsPendingMySignature: jest.fn(async () => []),
  getPendingProposals: jest.fn(async () => []),
  getMyReferralJobs: jest.fn(async () => [mockJob]),
}));

jest.mock("../../services/quoteService", () => {
  const actual = jest.requireActual("../../services/quoteService");
  return {
    ...actual,
    getMyQuoteRequests: jest.fn(async () => [{ id: "q1", propertyId: "p1", serviceType: "Roofing", urgency: "medium", description: "Roof soffit repair", status: "open", createdAt: 0, closeAt: null }]),
    getBids: jest.fn(async () => [{ id: "b1", requestId: "q1", contractorId: "c", contractorName: "Ridgeline Exteriors", verified: true, jobsCompleted: 5, amountCents: 148_000, timelineDays: 5, status: "Pending" }]),
  };
});

jest.mock("../../services/upkeepService", () => {
  const actual = jest.requireActual("../../services/upkeepService");
  return {
    ...actual,
    getRecurringServices: jest.fn(async () => [{ id: "s1", serviceType: "GutterCleaning", providerName: "Bell & Sons", providerPhone: null, frequency: "SemiAnnually", startDate: "2026-10-20", notes: null, status: "Active", lastVisit: null }]),
    getSchedule: jest.fn(async () => []),
    getSensorSummaries: jest.fn(async () => [{ id: "d1", label: "BASEMENT WATER", value: "All clear", note: "No alerts this week", alert: false }]),
  };
});

jest.mock("../../services/contractorService", () => {
  const actual = jest.requireActual("../../services/contractorService");
  return {
    ...actual,
    getLeads: jest.fn(async () => [{ id: "l1", serviceType: "Gutters", description: "140 ft seamless aluminum", urgency: "Medium", propertyZip: "32174", createdAt: Date.now() - 2 * 3_600_000, closeAt: null }]),
    getMyContractorProfile: jest.fn(async () => ({ name: "Bell & Sons", specialties: ["Gutters", "Roofing"], trustScore: 90, jobsCompleted: 12, isVerified: true })),
    getPendingSignatureJobs: jest.fn(async () => [{ id: "s1", propertyAddress: "p1", serviceType: "Gutters", completedDate: "2026-10-01", amountCents: 18_000, awaitingRole: "contractor" }]),
  };
});

jest.mock("../../services/bidService", () => ({ getMyBidRequestIds: jest.fn(async () => new Set<string>()) }));

// ── Harness ──────────────────────────────────────────────────────────────────

import { AppDataProvider } from "../../context/AppData";
import RootNavigator from "../../navigation/RootNavigator";

function renderApp() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <NavigationContainer>
        <AppDataProvider>
          <RootNavigator />
        </AppDataProvider>
      </NavigationContainer>
    </SafeAreaProvider>,
  );
}

async function tab(label: string) {
  await act(async () => { fireEvent.press(screen.getByRole("tab", { name: label })); });
}

beforeEach(() => { mockRole = "Homeowner"; mockTier = "Free"; });

describe("homeowner tabs", () => {
  it("NAV.1 renders every tab with live data", async () => {
    renderApp();
    await waitFor(() => expect(screen.getAllByText("412 Grandview Ave").length).toBeGreaterThan(0));
    expect(screen.getByText(/GOOD (MORNING|AFTERNOON|EVENING), DANA/)).toBeTruthy();
    expect(screen.getByText("HOMEGENTIC SCORE")).toBeTruthy();
    expect(await screen.findByText("Gutter cleaning")).toBeTruthy();
    expect(screen.getByText("Free plan")).toBeTruthy();
    expect(await screen.findByText("1 of 1 property · 6 of 10 AI calls left this week")).toBeTruthy();

    await tab("Property");
    expect(await screen.findByText("PREMIUM VERIFIED")).toBeTruthy();
    expect(screen.getByText("DEED ON FILE")).toBeTruthy();
    expect(await screen.findByText("Kitchen")).toBeTruthy();
    expect(await screen.findByText("All clear")).toBeTruthy();

    await tab("Jobs");
    expect(await screen.findByText("1 open, 1 logged")).toBeTruthy();
    expect(await screen.findByText("Ridgeline Exteriors")).toBeTruthy();
    expect(screen.getByText("1 OF 3 OPEN REQUESTS ON FREE")).toBeTruthy();

    await tab("Upkeep");
    expect(await screen.findByText("What's coming up")).toBeTruthy();

    await tab("Account");
    expect(await screen.findByText("Dana Mireles")).toBeTruthy();
  });

  it("NAV.2 Free gets the shared-access gate; Pro sees managers and activity", async () => {
    renderApp();
    await tab("Account");
    expect(await screen.findByText("PART OF PRO")).toBeTruthy();

    mockTier = "Pro";
    screen.unmount();
    renderApp();
    expect(await screen.findByText(/WHILE YOU WERE OUT/)).toBeTruthy();
    expect(screen.getByText("Marcus Dean moved gutter cleaning to Aug 21.")).toBeTruthy();
    await tab("Account");
    expect(await screen.findByText("Marcus Dean")).toBeTruthy();
    expect(screen.getByText("Can book up to $500")).toBeTruthy();
  });

  it("NAV.4 the assistant button opens role-specific prompts", async () => {
    renderApp();
    await waitFor(() => expect(screen.getAllByText("412 Grandview Ave").length).toBeGreaterThan(0));
    await act(async () => { fireEvent.press(screen.getByLabelText("Ask the assistant")); });
    expect(await screen.findByText("Ask about 412 Grandview Ave.")).toBeTruthy();
    expect(screen.getByText("What's dragging my score down?")).toBeTruthy();
    expect(screen.getByText("10 AI CALLS A WEEK ON FREE · 6 LEFT")).toBeTruthy();
  });

  it("NAV.5 the plan card opens the web hand-off", async () => {
    renderApp();
    await act(async () => { fireEvent.press(await screen.findByLabelText("Upgrade plan")); });
    expect(await screen.findByText("Pro is $59 a year.")).toBeTruthy();
    expect(screen.getByText("Opens your browser. Nothing is charged in the app.")).toBeTruthy();
  });
});

describe("contractor tabs", () => {
  beforeEach(() => { mockRole = "Contractor"; mockTier = "ContractorFree"; });

  it("NAV.3 renders Leads, Sign, Earnings and Account", async () => {
    renderApp();
    expect(await screen.findByText("LEADS · GUTTERS, ROOFING")).toBeTruthy();
    expect(await screen.findByText("1 open for you")).toBeTruthy();
    expect(screen.getByText("POSTED 2H AGO")).toBeTruthy();

    await tab("Sign");
    expect(await screen.findByText("1 waiting on you")).toBeTruthy();
    expect(screen.getByText("AWAITING YOU")).toBeTruthy();

    await tab("Earnings");
    expect(await screen.findByText("$1,240 from 1 job")).toBeTruthy();
    expect(screen.getByText("$37.20 FEE · 3%")).toBeTruthy();
    expect(screen.getByText("Contractor Free plan")).toBeTruthy();

    await tab("Account");
    expect(await screen.findByText("GUTTERS, ROOFING")).toBeTruthy();
  });

  it("NAV.3b Contractor Pro pays no referral fees", async () => {
    mockTier = "ContractorPro";
    renderApp();
    await tab("Earnings");
    expect(await screen.findByText("NO FEE · CONTRACTOR PRO")).toBeTruthy();
    expect(screen.getByText("$0.00")).toBeTruthy();
  });
});
