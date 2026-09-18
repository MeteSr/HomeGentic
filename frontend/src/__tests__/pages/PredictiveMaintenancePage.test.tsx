/**
 * PredictiveMaintenancePage — real logic worth locking down:
 *   - the mobile breakpoint renders MobileMaintenancePage instead of the
 *     desktop layout
 *   - recurring services are classified into ACTIVE / DUE SOON / PAUSED
 *     status badges based on the real toRecurringDisplay date math (a
 *     service due within 7 days is "due-soon", a Paused service always
 *     shows "PAUSED" regardless of its computed next-visit date)
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PredictiveMaintenancePage from "@/pages/PredictiveMaintenancePage";
import type { RecurringService, VisitLog } from "@/services/recurringService";

const { mockUseBreakpoint, mockUsePropertyStore, mockUseJobStore, mockGetByProperty, mockGetVisitLogs, mockPredict, mockGetScheduleByProperty, mockSystemAgesGet } = vi.hoisted(() => ({
  mockUseBreakpoint: vi.fn(),
  mockUsePropertyStore: vi.fn(),
  mockUseJobStore: vi.fn(),
  mockGetByProperty: vi.fn(),
  mockGetVisitLogs: vi.fn(),
  mockPredict: vi.fn(),
  mockGetScheduleByProperty: vi.fn(),
  mockSystemAgesGet: vi.fn(),
}));

vi.mock("@/hooks/useBreakpoint", () => ({ useBreakpoint: mockUseBreakpoint }));
vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));
vi.mock("@/store/jobStore", () => ({ useJobStore: mockUseJobStore }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div data-testid="layout">{children}</div> }));
vi.mock("@/pages/MobileMaintenancePage", () => ({ MobileMaintenancePage: () => <div data-testid="mobile-maintenance-page" /> }));
vi.mock("@/services/systemAges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/systemAges")>();
  return { ...actual, systemAgesService: { ...actual.systemAgesService, get: mockSystemAgesGet } };
});
vi.mock("@/services/maintenance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/maintenance")>();
  return {
    ...actual,
    maintenanceService: {
      ...actual.maintenanceService,
      predict: mockPredict,
      getScheduleByProperty: mockGetScheduleByProperty,
    },
  };
});
vi.mock("@/services/recurringService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recurringService")>();
  return {
    ...actual,
    recurringService: { getByProperty: mockGetByProperty, getVisitLogs: mockGetVisitLogs },
  };
});

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "svc-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC" as any, providerName: "Cool Air Co.",
    frequency: "Quarterly" as any, startDate: "2024-01-01", status: "Active" as any, createdAt: Date.now(),
    ...overrides,
  };
}

function renderPage() {
  return render(<MemoryRouter><PredictiveMaintenancePage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  mockUsePropertyStore.mockReturnValue({ properties: [{ id: "prop-1", yearBuilt: 2000n, state: "TX" }] });
  mockUseJobStore.mockReturnValue({ jobs: [] });
  mockSystemAgesGet.mockReturnValue({});
  mockPredict.mockReturnValue({ systemPredictions: [], annualTasks: [] });
  mockGetScheduleByProperty.mockResolvedValue([]);
  mockGetVisitLogs.mockResolvedValue([] as VisitLog[]);
});

describe("PredictiveMaintenancePage — mobile breakpoint", () => {
  it("renders MobileMaintenancePage instead of the desktop layout when isMobile", () => {
    mockUseBreakpoint.mockReturnValue({ isMobile: true, isTablet: false });
    mockGetByProperty.mockResolvedValue([]);
    renderPage();
    expect(screen.getByTestId("mobile-maintenance-page")).toBeInTheDocument();
  });
});

describe("PredictiveMaintenancePage — recurring service status badges", () => {
  it("shows DUE SOON for a service whose next visit falls within 7 days", async () => {
    mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false });
    const sixtyDaysAgo = new Date(Date.now() - 83 * 86_400_000).toISOString().slice(0, 10); // Quarterly (90d) - 83 = due in 7d
    mockGetByProperty.mockResolvedValue([makeService({ startDate: sixtyDaysAgo, status: "Active" as any })]);
    renderPage();

    expect(await screen.findByText("DUE SOON")).toBeInTheDocument();
  });

  it("shows PAUSED for a Paused service regardless of its computed due date", async () => {
    mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false });
    mockGetByProperty.mockResolvedValue([makeService({ status: "Paused" as any })]);
    renderPage();

    expect(await screen.findByText("PAUSED")).toBeInTheDocument();
  });

  it("shows ACTIVE for a service with a far-off next visit", async () => {
    mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false });
    mockGetByProperty.mockResolvedValue([makeService({ startDate: new Date().toISOString().slice(0, 10), status: "Active" as any })]);
    renderPage();

    expect(await screen.findByText("ACTIVE")).toBeInTheDocument();
  });
});
