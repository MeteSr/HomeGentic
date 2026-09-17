/**
 * SensorPage — real logic worth locking down:
 *   - loading -> empty -> populated states
 *   - critical alert banner only shows for a Critical-severity alert
 *   - header count of active devices + "needs attention" (Critical|Warning)
 *   - deactivate: optimistic removal from the list + success/error toast
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SensorPage from "@/pages/SensorPage";
import type { SensorDevice, SensorEvent } from "@/services/sensor";

const { mockGetDevices, mockGetAlerts, mockDeactivate, mockEventLabel, mockGetMyProperties } = vi.hoisted(() => ({
  mockGetDevices:      vi.fn(),
  mockGetAlerts:       vi.fn(),
  mockDeactivate:      vi.fn(),
  mockEventLabel:      vi.fn((t: string) => t),
  mockGetMyProperties: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/sensor", () => ({
  sensorService: {
    getDevicesForProperty: mockGetDevices,
    getPendingAlerts:      mockGetAlerts,
    deactivateDevice:      mockDeactivate,
    eventLabel:            mockEventLabel,
  },
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: mockGetMyProperties },
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: [{ id: "prop-1" }], setProperties: vi.fn() }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/RegisterDeviceModal", () => ({
  RegisterDeviceModal: () => null,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

function makeDevice(overrides: Partial<SensorDevice> = {}): SensorDevice {
  return {
    id: "dev-1", propertyId: "prop-1", homeowner: "p-owner",
    externalDeviceId: "ext-1", source: "Nest" as any, name: "Kitchen sensor",
    registeredAt: Date.now(), isActive: true,
    ...overrides,
  } as SensorDevice;
}

function makeAlert(overrides: Partial<SensorEvent> = {}): SensorEvent {
  return {
    id: "evt-1", deviceId: "dev-1", propertyId: "prop-1",
    eventType: "Leak" as any, value: 0, unit: "", timestamp: Date.now(),
    severity: "Critical" as any,
    ...overrides,
  } as SensorEvent;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SensorPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyProperties.mockResolvedValue([]);
  mockGetAlerts.mockResolvedValue([]);
});

describe("SensorPage — states", () => {
  it("shows the empty state when there are no devices", async () => {
    mockGetDevices.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No devices registered")).toBeInTheDocument());
  });

  it("renders a device card once loaded", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen sensor")).toBeInTheDocument());
    expect(screen.getByText("Online")).toBeInTheDocument();
  });
});

describe("SensorPage — header counts", () => {
  it("counts active devices and needs-attention alerts in the header", async () => {
    mockGetDevices.mockResolvedValue([
      makeDevice({ id: "d1", isActive: true }),
      makeDevice({ id: "d2", isActive: true }),
      makeDevice({ id: "d3", isActive: false }),
    ]);
    mockGetAlerts.mockResolvedValue([
      makeAlert({ deviceId: "d1", severity: "Critical" as any }),
      makeAlert({ id: "e2", deviceId: "d2", severity: "Warning" as any }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/2 devices reporting · 2 needs attention/)).toBeInTheDocument());
  });
});

describe("SensorPage — critical alert banner", () => {
  it("shows the banner when a Critical alert is present", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    mockGetAlerts.mockResolvedValue([makeAlert({ severity: "Critical" as any })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Book a plumber")).toBeInTheDocument());
  });

  it("does not show the banner when alerts are only Warning severity", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    mockGetAlerts.mockResolvedValue([makeAlert({ severity: "Warning" as any })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen sensor")).toBeInTheDocument());
    expect(screen.queryByText("Book a plumber")).not.toBeInTheDocument();
  });
});

describe("SensorPage — remove device", () => {
  it("optimistically removes the device and shows a success toast", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    mockDeactivate.mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen sensor")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Remove"));

    await waitFor(() => expect(screen.queryByText("Kitchen sensor")).not.toBeInTheDocument());
    expect(mockToastSuccess).toHaveBeenCalledWith("Device removed");
  });

  it("shows an error toast and keeps the device when deactivation fails", async () => {
    mockGetDevices.mockResolvedValue([makeDevice()]);
    mockDeactivate.mockRejectedValue(new Error("network error"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen sensor")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Remove"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not remove device"));
    expect(screen.getByText("Kitchen sensor")).toBeInTheDocument();
  });
});
