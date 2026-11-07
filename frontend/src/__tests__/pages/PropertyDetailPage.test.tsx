/**
 * PropertyDetailPage — real logic worth locking down:
 *   - shows a loading spinner while property/jobs are loading, "Property not
 *     found" when the fetch resolves to null, and MobilePropertyPage on
 *     mobile breakpoints
 *   - tab labels reflect real counts (Jobs (N), Rooms (N)) and clicking a
 *     tab switches which tab panel renders
 *   - the HomeGentic score shown is the real computeScoreWithDecay() output
 *     for the loaded property/jobs
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PropertyDetailPage from "@/pages/PropertyDetailPage";
import { computeScoreWithDecay } from "@/services/scoreService";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

const {
  mockUseBreakpoint, mockUsePropertyStore, mockUseAuthStore,
  mockUsePropertyDetail, mockUsePropertyJobs, mockUsePropertyPhotos,
  mockUsePropertyRooms, mockUsePropertyMaintenance, mockUsePropertyScore,
  mockGetRecord,
} = vi.hoisted(() => ({
  mockUseBreakpoint: vi.fn(),
  mockUsePropertyStore: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockUsePropertyDetail: vi.fn(),
  mockUsePropertyJobs: vi.fn(),
  mockUsePropertyPhotos: vi.fn(),
  mockUsePropertyRooms: vi.fn(),
  mockUsePropertyMaintenance: vi.fn(),
  mockUsePropertyScore: vi.fn(),
  mockGetRecord: vi.fn(async () => null),
}));

vi.mock("@/hooks/useBreakpoint", () => ({ useBreakpoint: mockUseBreakpoint }));
vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));
vi.mock("@/hooks/usePropertyDetail", () => ({ usePropertyDetail: mockUsePropertyDetail }));
vi.mock("@/hooks/usePropertyJobs", () => ({ usePropertyJobs: mockUsePropertyJobs }));
vi.mock("@/hooks/usePropertyPhotos", () => ({ usePropertyPhotos: mockUsePropertyPhotos }));
vi.mock("@/hooks/usePropertyRooms", () => ({ usePropertyRooms: mockUsePropertyRooms }));
vi.mock("@/hooks/usePropertyMaintenance", () => ({ usePropertyMaintenance: mockUsePropertyMaintenance }));
vi.mock("@/hooks/usePropertyScore", () => ({ usePropertyScore: mockUsePropertyScore }));
vi.mock("@/services/fsbo", () => ({ fsboService: { getRecord: mockGetRecord } }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <div data-testid="layout">{children}</div> }));
vi.mock("@/pages/MobilePropertyPage", () => ({ MobilePropertyPage: () => <div data-testid="mobile-property-page" /> }));
vi.mock("@/pages/PropertyDetail/TimelineTab", () => ({ TimelineTab: () => <div data-testid="tab-timeline" /> }));
vi.mock("@/pages/PropertyDetail/JobsTab", () => ({ JobsTab: () => <div data-testid="tab-jobs" /> }));
vi.mock("@/pages/PropertyDetail/DocumentsTab", () => ({ DocumentsTab: () => <div data-testid="tab-documents" /> }));
vi.mock("@/pages/PropertyDetail/SettingsTab", () => ({ SettingsTab: () => <div data-testid="tab-settings" /> }));
vi.mock("@/pages/PropertyDetail/RoomsTab", () => ({ RoomsTab: () => <div data-testid="tab-rooms" /> }));
vi.mock("@/pages/PropertyDetail/BillsTab", () => ({ BillsTab: () => <div data-testid="tab-bills" /> }));
vi.mock("@/pages/PropertyDetail/InsuranceTab", () => ({ InsuranceTab: () => <div data-testid="tab-insurance" /> }));
vi.mock("@/pages/PropertyDetail/HomeWarrantyTab", () => ({
  HomeWarrantyTab: ({ jobs }: { jobs: { id: string; label: string }[] }) => (
    <div data-testid="tab-home-warranty">{jobs.length}</div>
  ),
}));
vi.mock("@/pages/PropertyDetail/HouseGuideTab", () => ({ HouseGuideTab: () => <div data-testid="tab-guide" /> }));
vi.mock("@/pages/PropertyDetail/HoaTab", () => ({
  HoaTab: ({ propertyType, jobs }: { propertyType: string; jobs: { id: string; label: string }[] }) => (
    <div data-testid="tab-hoa">{`${propertyType}:${jobs.map((j) => j.label).join("|")}`}</div>
  ),
}));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "Service", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/properties/${id}`]}>
      <Routes>
        <Route path="/properties/:id" element={<PropertyDetailPage />} />
        <Route path="/properties/:id/move-in" element={<div data-testid="move-in-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseBreakpoint.mockReturnValue({ isMobile: false, isTablet: false });
  mockUsePropertyStore.mockReturnValue({ properties: [] });
  mockUseAuthStore.mockReturnValue({ principal: "my-principal" });
  mockUsePropertyPhotos.mockReturnValue({ photosByJob: {}, uploadPhoto: vi.fn(), uploadRoomPhoto: vi.fn() });
  mockUsePropertyRooms.mockReturnValue({ rooms: [], setRooms: vi.fn() });
  mockUsePropertyMaintenance.mockReturnValue({ recurringServices: [], visitLogMap: {}, systemAges: {} });
  mockUsePropertyScore.mockReturnValue({ scoreHistory: [] });
  mockGetRecord.mockResolvedValue(null);
});

describe("PropertyDetailPage — loading / not-found / mobile", () => {
  it("shows a loading spinner while data is loading", () => {
    mockUsePropertyDetail.mockReturnValue({ property: null, loading: true });
    mockUsePropertyJobs.mockReturnValue({ jobs: [], loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    renderAt("prop-1");
    expect(document.querySelector(".spinner-lg")).toBeInTheDocument();
  });

  it("shows 'Property not found' when the property fetch resolves to null", () => {
    mockUsePropertyDetail.mockReturnValue({ property: null, loading: false });
    mockUsePropertyJobs.mockReturnValue({ jobs: [], loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    renderAt("prop-1");
    expect(screen.getByText("Property not found")).toBeInTheDocument();
  });

  it("renders MobilePropertyPage on mobile breakpoints", () => {
    mockUseBreakpoint.mockReturnValue({ isMobile: true, isTablet: false });
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty(), loading: false });
    mockUsePropertyJobs.mockReturnValue({ jobs: [], loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    renderAt("prop-1");
    expect(screen.getByTestId("mobile-property-page")).toBeInTheDocument();
  });
});

describe("PropertyDetailPage — tabs", () => {
  beforeEach(() => {
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty(), loading: false });
    mockUsePropertyJobs.mockReturnValue({ jobs: [makeJob(), makeJob({ id: "job-2" })], loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    mockUsePropertyRooms.mockReturnValue({ rooms: [{ id: "r1" }], setRooms: vi.fn() });
  });

  it("shows the timeline tab by default with real job/room counts in labels", () => {
    renderAt("prop-1");
    expect(screen.getByTestId("tab-timeline")).toBeInTheDocument();
    expect(screen.getByText("Jobs (2)")).toBeInTheDocument();
    expect(screen.getByText("Rooms (1)")).toBeInTheDocument();
  });

  it("switches to the Jobs tab panel when clicked", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByText("Jobs (2)"));
    expect(screen.getByTestId("tab-jobs")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-timeline")).not.toBeInTheDocument();
  });

  it("opens the move-in plan (#712)", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByRole("button", { name: /move-in plan/i }));
    expect(screen.getByTestId("move-in-route")).toBeInTheDocument();
  });

  it("has an Insurance tab for the home's policy", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByText("Insurance"));
    expect(screen.getByTestId("tab-insurance")).toBeInTheDocument();
  });

  it("has a Home warranty tab for the plan and its claims (#719)", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByText("Home warranty"));
    expect(screen.getByTestId("tab-home-warranty")).toBeInTheDocument();
  });

  it("has a House guide tab for sitters and guests (#725)", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByText("House guide"));
    expect(screen.getByTestId("tab-guide")).toBeInTheDocument();
  });

  it("has an HOA tab that knows the home type and its jobs (#726)", () => {
    renderAt("prop-1");
    fireEvent.click(screen.getByText("HOA"));
    const tab = screen.getByTestId("tab-hoa");
    expect(tab.textContent).toMatch(/^SingleFamily:/);
    expect(tab.textContent).toMatch(/\(\w{3} \d{1,2}, \d{4}\)/);
  });

  it("scrolls the tab row sideways instead of clipping the last tabs on narrow screens", () => {
    renderAt("prop-1");
    const settings = screen.getByText("Settings");
    expect(settings.parentElement!.style.overflowX).toBe("auto");
    for (const label of ["House guide", "Settings"]) {
      const btn = screen.getByText(label);
      expect(btn.style.whiteSpace).toBe("nowrap");
      expect(btn.style.flexShrink).toBe("0");
    }
  });
});

describe("PropertyDetailPage — hero photo", () => {
  beforeEach(() => {
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty(), loading: false });
    mockUsePropertyJobs.mockReturnValue({ jobs: [], loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    mockUsePropertyRooms.mockReturnValue({ rooms: [], setRooms: vi.fn() });
  });

  it("never uses a claim damage photo or an inventory photo as the home's picture", () => {
    mockUsePropertyPhotos.mockReturnValue({
      photosByJob: {
        "claim_c1": [{ id: "d", jobId: "claim_c1", url: "blob:damage" }],
        "inventory_i1": [{ id: "i", jobId: "inventory_i1", url: "blob:receipt" }],
        JOB_1: [{ id: "j", jobId: "JOB_1", url: "blob:job" }] },
      uploadPhoto: vi.fn(),
      uploadRoomPhoto: vi.fn(),
    });
    renderAt("prop-1");
    expect(screen.getByAltText("Property")).toHaveAttribute("src", "blob:job");
  });
});

describe("PropertyDetailPage — score", () => {
  it("shows the real computeScoreWithDecay() result for loaded property/jobs", () => {
    const property = makeProperty();
    // Recent date avoids triggering inactivity decay, keeping the expected
    // score computation simple (matches the page's own getAllDecayEvents()).
    const jobs = [makeJob({ date: new Date().toISOString().slice(0, 10) })];
    mockUsePropertyDetail.mockReturnValue({ property, loading: false });
    mockUsePropertyJobs.mockReturnValue({ jobs, loading: false, reload: vi.fn(), verifyJob: vi.fn() });
    renderAt("prop-1");

    const expectedScore = computeScoreWithDecay(jobs, [property], 0);
    expect(screen.getByText(String(expectedScore))).toBeInTheDocument();
  });
});
