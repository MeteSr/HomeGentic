/**
 * MobileMaintenancePage — real logic worth locking down:
 *   - empty state when there are no recurring services
 *   - next-visit due classification: overdue / due soon (<=7d) / upcoming,
 *     computed from the last visit or the service start date when there
 *     hasn't been one yet
 *   - the at-risk score banner only renders when there are warnings, and
 *     its text joins multiple warnings with correct point-sign and
 *     day-count pluralization
 *   - navigation to /maintenance from both the "Add" row and the footer link
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MobileMaintenancePage } from "@/pages/MobileMaintenancePage";
import type { RecurringService, VisitLog } from "@/services/recurringService";
import type { AtRiskWarning } from "@/services/scoreDecayService";
import type { Property } from "@/services/property";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockUsePropertyStore, mockUseJobStore, mockUseMaintenanceSchedule, mockGetAtRiskWarnings, mockSystemAgesGet } = vi.hoisted(() => ({
  mockUsePropertyStore: vi.fn(),
  mockUseJobStore: vi.fn(),
  mockUseMaintenanceSchedule: vi.fn(),
  mockGetAtRiskWarnings: vi.fn(),
  mockSystemAgesGet: vi.fn(),
}));

vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));
vi.mock("@/store/jobStore", () => ({ useJobStore: mockUseJobStore }));
vi.mock("@/hooks/useMaintenanceSchedule", () => ({ useMaintenanceSchedule: mockUseMaintenanceSchedule }));
vi.mock("@/services/scoreDecayService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/scoreDecayService")>();
  return { ...actual, getAtRiskWarnings: mockGetAtRiskWarnings };
});
vi.mock("@/services/systemAges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/systemAges")>();
  return { ...actual, systemAgesService: { get: mockSystemAgesGet } };
});

function makeProperty(id: string): Property {
  return {
    id, owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
  };
}

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "svc-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "LawnCare",
    providerName: "Green Lawn Co", frequency: "Monthly", startDate: "2024-01-01",
    status: "Active", createdAt: Date.now(),
    ...overrides,
  } as RecurringService;
}

function makeVisit(overrides: Partial<VisitLog> = {}): VisitLog {
  return { id: "visit-1", serviceId: "svc-1", propertyId: "prop-1", visitDate: "2024-06-01", createdAt: Date.now(), ...overrides } as VisitLog;
}

function makeWarning(overrides: Partial<AtRiskWarning> = {}): AtRiskWarning {
  return { id: "w1", label: "HVAC warranty", pts: -2, dueAt: Date.now() + 86400000, daysRemaining: 5, ...overrides };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MobileMaintenancePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePropertyStore.mockReturnValue({ properties: [makeProperty("prop-1")], isLoading: false });
  mockUseJobStore.mockReturnValue({ jobs: [] });
  mockUseMaintenanceSchedule.mockReturnValue({ recurringServices: [], visitLogMap: {} });
  mockGetAtRiskWarnings.mockReturnValue([]);
  mockSystemAgesGet.mockReturnValue({});
});

describe("MobileMaintenancePage — empty state", () => {
  it("shows the empty-schedule message when there are no recurring services", () => {
    renderPage();
    expect(screen.getByText("Nothing scheduled yet")).toBeInTheDocument();
  });
});

describe("MobileMaintenancePage — due classification", () => {
  it("marks a service overdue when its next visit date has passed", () => {
    mockUseMaintenanceSchedule.mockReturnValue({
      recurringServices: [makeService({ id: "svc-1", frequency: "Monthly" })],
      visitLogMap: { "svc-1": [makeVisit({ visitDate: "2024-01-01" })] }, // long past, well overdue
    });
    renderPage();
    expect(screen.getByText("OVERDUE")).toBeInTheDocument();
  });

  it("marks a service due soon when the next visit is within 7 days", () => {
    const soon = new Date(Date.now() - 23 * 86400000).toISOString().slice(0, 10); // Monthly (30d) - 23d ago = ~7d out
    mockUseMaintenanceSchedule.mockReturnValue({
      recurringServices: [makeService({ id: "svc-1", frequency: "Monthly" })],
      visitLogMap: { "svc-1": [makeVisit({ visitDate: soon })] },
    });
    renderPage();
    expect(screen.getByText("DUE SOON")).toBeInTheDocument();
  });

  it("marks a service upcoming when the next visit is more than 7 days out", () => {
    const recent = new Date().toISOString().slice(0, 10); // just visited, 30d until next
    mockUseMaintenanceSchedule.mockReturnValue({
      recurringServices: [makeService({ id: "svc-1", frequency: "Monthly" })],
      visitLogMap: { "svc-1": [makeVisit({ visitDate: recent })] },
    });
    renderPage();
    expect(screen.getByText("UPCOMING")).toBeInTheDocument();
  });

  it("falls back to the service start date when there's no visit history yet", () => {
    const recentStart = new Date().toISOString().slice(0, 10);
    mockUseMaintenanceSchedule.mockReturnValue({
      recurringServices: [makeService({ id: "svc-1", frequency: "Monthly", startDate: recentStart })],
      visitLogMap: {},
    });
    renderPage();
    expect(screen.getByText("UPCOMING")).toBeInTheDocument();
  });

  it("shows the provider name and frequency as row meta when a provider is set", () => {
    mockUseMaintenanceSchedule.mockReturnValue({
      recurringServices: [makeService({ id: "svc-1", providerName: "Green Lawn Co", frequency: "Quarterly" })],
      visitLogMap: {},
    });
    renderPage();
    expect(screen.getByText("Green Lawn Co · Quarterly")).toBeInTheDocument();
  });
});

describe("MobileMaintenancePage — at-risk banner", () => {
  it("does not render the banner when there are no warnings", () => {
    mockGetAtRiskWarnings.mockReturnValue([]);
    renderPage();
    expect(screen.queryByText("SCORE AT RISK")).not.toBeInTheDocument();
  });

  it("shows a single warning with correct pluralization and point sign", () => {
    mockGetAtRiskWarnings.mockReturnValue([makeWarning({ label: "HVAC warranty", daysRemaining: 1, pts: -2 })]);
    renderPage();
    expect(screen.getByText("HVAC warranty in 1 day (-2 pts).")).toBeInTheDocument();
  });

  it("joins multiple warnings with 'and'", () => {
    mockGetAtRiskWarnings.mockReturnValue([
      makeWarning({ label: "HVAC warranty", daysRemaining: 5, pts: -2 }),
      makeWarning({ id: "w2", label: "Roof warranty", daysRemaining: 10, pts: -3 }),
    ]);
    renderPage();
    expect(screen.getByText("HVAC warranty in 5 days (-2 pts) and Roof warranty in 10 days (-3 pts).")).toBeInTheDocument();
  });
});

describe("MobileMaintenancePage — navigation", () => {
  it("navigates to /maintenance from the Add row", () => {
    renderPage();
    fireEvent.click(screen.getByText("Add a recurring service"));
    expect(mockNavigate).toHaveBeenCalledWith("/maintenance");
  });

  it("navigates to /maintenance from the footer link", () => {
    renderPage();
    fireEvent.click(screen.getByText("View recurring services & history"));
    expect(mockNavigate).toHaveBeenCalledWith("/maintenance");
  });
});
