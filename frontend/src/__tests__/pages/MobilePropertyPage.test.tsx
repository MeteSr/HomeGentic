/**
 * MobilePropertyPage — real logic worth locking down:
 *   - verified badge shows for Basic/Pro/Premium tiers, "UNVERIFIED"
 *     otherwise, with matching description text
 *   - room rows: DOCUMENTED vs NEEDS WORK chip based on fixture count,
 *     and item-count pluralization; empty-rooms state
 *   - sensors: loading (renders nothing), empty state with a connect
 *     button, and loaded state with device/alert summary cards
 *   - the property picker renders a plain heading for a single property
 *     but a dropdown for multiple, and selecting one updates the route
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MobilePropertyPage } from "@/pages/MobilePropertyPage";
import type { Property } from "@/services/property";
import type { SensorDevice, SensorEvent } from "@/services/sensor";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: "prop-1" }) };
});

const { mockUsePropertyStore, mockUsePropertyDetail, mockUsePropertyRooms, mockGetDevices, mockGetPendingAlerts, mockEventLabel, mockSeverityColor } = vi.hoisted(() => ({
  mockUsePropertyStore: vi.fn(),
  mockUsePropertyDetail: vi.fn(),
  mockUsePropertyRooms: vi.fn(),
  mockGetDevices: vi.fn(),
  mockGetPendingAlerts: vi.fn(),
  mockEventLabel: vi.fn(),
  mockSeverityColor: vi.fn(),
}));

vi.mock("@/store/propertyStore", () => ({ usePropertyStore: mockUsePropertyStore }));
vi.mock("@/hooks/usePropertyDetail", () => ({ usePropertyDetail: mockUsePropertyDetail }));
vi.mock("@/hooks/usePropertyRooms", () => ({ usePropertyRooms: mockUsePropertyRooms }));
vi.mock("@/services/sensor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sensor")>();
  return {
    ...actual,
    sensorService: {
      getDevicesForProperty: mockGetDevices,
      getPendingAlerts: mockGetPendingAlerts,
      eventLabel: mockEventLabel,
      severityColor: mockSeverityColor,
    },
  };
});

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St, Austin, TX", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeDevice(overrides: Partial<SensorDevice> = {}): SensorDevice {
  return {
    id: "dev-1", propertyId: "prop-1", homeowner: "p-owner", externalDeviceId: "ext-1",
    source: "Nest" as any, name: "Thermostat", registeredAt: Date.now(), isActive: true,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<SensorEvent> = {}): SensorEvent {
  return {
    id: "evt-1", deviceId: "dev-1", propertyId: "prop-1", eventType: "LeakDetected" as any,
    value: 1, unit: "", timestamp: Date.now(), severity: "High" as any, jobId: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MobilePropertyPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePropertyStore.mockReturnValue({ properties: [makeProperty()] });
  mockUsePropertyDetail.mockReturnValue({ property: makeProperty(), loading: false });
  mockUsePropertyRooms.mockReturnValue({ rooms: [] });
  mockGetDevices.mockResolvedValue([]);
  mockGetPendingAlerts.mockResolvedValue([]);
  mockEventLabel.mockReturnValue("Leak detected");
  mockSeverityColor.mockReturnValue("#DC2626");
});

describe("MobilePropertyPage — verification badge", () => {
  it("shows UNVERIFIED and the unlock copy for a non-tiered property", () => {
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty({ tier: "Free" as any }), loading: false });
    renderPage();
    expect(screen.getByText("UNVERIFIED")).toBeInTheDocument();
    expect(screen.getByText(/Verify ownership to unlock/)).toBeInTheDocument();
  });

  it("shows a tier-specific verified badge for Pro", () => {
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty({ tier: "Pro" as any }), loading: false });
    renderPage();
    expect(screen.getByText("PRO VERIFIED")).toBeInTheDocument();
    expect(screen.getByText("Ownership verified on-chain.")).toBeInTheDocument();
  });

  it("shows a verified badge for Basic and Premium tiers too", () => {
    mockUsePropertyDetail.mockReturnValue({ property: makeProperty({ tier: "Basic" as any }), loading: false });
    const { rerender } = renderPage();
    expect(screen.getByText("BASIC VERIFIED")).toBeInTheDocument();

    mockUsePropertyDetail.mockReturnValue({ property: makeProperty({ tier: "Premium" as any }), loading: false });
    rerender(
      <MemoryRouter>
        <MobilePropertyPage />
      </MemoryRouter>
    );
    expect(screen.getByText("PREMIUM VERIFIED")).toBeInTheDocument();
  });
});

describe("MobilePropertyPage — rooms", () => {
  it("shows the empty-rooms state when there are none", () => {
    mockUsePropertyRooms.mockReturnValue({ rooms: [] });
    renderPage();
    expect(screen.getByText("No rooms added yet")).toBeInTheDocument();
  });

  it("marks a room DOCUMENTED when it has fixtures, with plural item count", () => {
    mockUsePropertyRooms.mockReturnValue({
      rooms: [{ id: "r1", name: "Kitchen", fixtures: [{ id: "f1" }, { id: "f2" }] } as any],
    });
    renderPage();
    expect(screen.getByText("DOCUMENTED")).toBeInTheDocument();
    expect(screen.getByText("2 ITEMS")).toBeInTheDocument();
  });

  it("marks a room NEEDS WORK when it has no fixtures, with singular item count", () => {
    mockUsePropertyRooms.mockReturnValue({
      rooms: [{ id: "r1", name: "Garage", fixtures: [] } as any],
    });
    renderPage();
    expect(screen.getByText("NEEDS WORK")).toBeInTheDocument();
    expect(screen.getByText("0 ITEMS")).toBeInTheDocument();
  });
});

describe("MobilePropertyPage — sensors", () => {
  it("shows the empty state with a connect button when no devices exist", async () => {
    mockGetDevices.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No sensors connected")).toBeInTheDocument());

    fireEvent.click(screen.getByText("+ Connect device"));
    expect(mockNavigate).toHaveBeenCalledWith("/sensors");
  });

  it("shows device and alert summary cards once devices load", async () => {
    mockGetDevices.mockResolvedValue([makeDevice({ source: "Nest" as any }), makeDevice({ id: "dev-2", source: "Ecobee" as any })]);
    mockGetPendingAlerts.mockResolvedValue([makeAlert()]);
    renderPage();

    await waitFor(() => expect(screen.getByText("2 connected")).toBeInTheDocument());
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByText("Leak detected")).toBeInTheDocument();
  });

  it("shows 'All clear' when there are no pending alerts", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    mockGetPendingAlerts.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getByText("All clear")).toBeInTheDocument());
    expect(screen.getByText("No pending alerts")).toBeInTheDocument();
  });
});

describe("MobilePropertyPage — property picker", () => {
  it("renders a plain heading (no dropdown) for a single property", () => {
    mockUsePropertyStore.mockReturnValue({ properties: [makeProperty()] });
    renderPage();
    expect(screen.queryByRole("button", { name: /Main St/ })).not.toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });

  it("shows a dropdown for multiple properties and navigates on selection", () => {
    mockUsePropertyStore.mockReturnValue({
      properties: [makeProperty({ id: "prop-1", address: "123 Main St, Austin, TX" }), makeProperty({ id: "prop-2", address: "456 Oak Ave, Austin, TX" })],
    });
    renderPage();

    fireEvent.click(screen.getByText("123 Main St"));
    fireEvent.click(screen.getByText("456 Oak Ave"));

    expect(mockNavigate).toHaveBeenCalledWith("/properties/prop-2", { replace: true });
  });
});
