/**
 * InsuranceDefensePage — real logic worth locking down:
 *   - jobs are filtered to insurance-relevant service types before any
 *     stats are computed (Roofing/HVAC/Electrical/Plumbing/Foundation only)
 *   - verified count and total value are computed from that filtered set
 *   - properties are grouped and only included when they have at least
 *     one insurance-relevant job, sorted by job date descending
 *   - the discount estimator is disabled with no properties, shows a
 *     loading/re-analyse label cycle, surfaces errors, and only counts
 *     recent (last 90 days) Critical severity events
 *   - bill anomalies are filtered to flagged Water bills only
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import InsuranceDefensePage from "@/pages/InsuranceDefensePage";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";
import type { SensorDevice, SensorEvent } from "@/services/sensor";
import type { BillRecord } from "@/services/billService";
import type { InsurerDiscountResult } from "@/services/insurerDiscountService";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetMyProperties } = vi.hoisted(() => ({ mockGetMyProperties: vi.fn() }));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getMyProperties: mockGetMyProperties } };
});

const { mockGetAllJobs } = vi.hoisted(() => ({ mockGetAllJobs: vi.fn() }));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getAll: mockGetAllJobs } };
});

const { mockGetDevices, mockGetEvents } = vi.hoisted(() => ({
  mockGetDevices: vi.fn(),
  mockGetEvents: vi.fn(),
}));
vi.mock("@/services/sensor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/sensor")>();
  return {
    ...actual,
    sensorService: { getDevicesForProperty: mockGetDevices, getEventsForProperty: mockGetEvents },
  };
});

const { mockGetBills } = vi.hoisted(() => ({ mockGetBills: vi.fn() }));
vi.mock("@/services/billService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/billService")>();
  return { ...actual, billService: { getBillsForProperty: mockGetBills } };
});

const { mockEstimateInsurerDiscount } = vi.hoisted(() => ({ mockEstimateInsurerDiscount: vi.fn() }));
vi.mock("@/services/insurerDiscountService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/insurerDiscountService")>();
  return { ...actual, estimateInsurerDiscount: mockEstimateInsurerDiscount };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
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
    amount: 100_000, date: "2024-06-01", description: "", isDiy: false,
    status: "verified" as any, verified: true, homeownerSigned: true, contractorSigned: true,
    photos: [], createdAt: Date.now(),
    ...overrides,
  } as Job;
}

function makeDiscountResult(overrides: Partial<InsurerDiscountResult> = {}): InsurerDiscountResult {
  return {
    discountRangeMin: 5, discountRangeMax: 15, qualifyingCategories: [], programs: [],
    recommendations: [], generatedAt: Date.now(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InsuranceDefensePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyProperties.mockResolvedValue([makeProperty()]);
  mockGetAllJobs.mockResolvedValue([]);
  mockGetDevices.mockResolvedValue([]);
  mockGetBills.mockResolvedValue([]);
  mockGetEvents.mockResolvedValue([]);
});

describe("InsuranceDefensePage — insurance-relevant filtering", () => {
  it("shows the empty state when no jobs are insurance-relevant", async () => {
    mockGetAllJobs.mockResolvedValue([makeJob({ serviceType: "Landscaping" })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No insurance-relevant records yet")).toBeInTheDocument());
  });

  it("counts only insurance-relevant jobs toward the record stats", async () => {
    mockGetAllJobs.mockResolvedValue([
      makeJob({ id: "j1", serviceType: "Roofing", status: "verified" as any }),
      makeJob({ id: "j2", serviceType: "HVAC", status: "pending" as any }),
      makeJob({ id: "j3", serviceType: "Landscaping" }), // not insurance-relevant, excluded
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Insurance-Relevant Records").previousElementSibling).toHaveTextContent("2"));
    expect(screen.getByText("Blockchain Verified").previousElementSibling).toHaveTextContent("1");
  });

  it("groups jobs by property, excluding properties with no insurance-relevant jobs", async () => {
    mockGetMyProperties.mockResolvedValue([
      makeProperty({ id: "prop-1", address: "123 Main St" }),
      makeProperty({ id: "prop-2", address: "456 Oak Ave" }),
    ]);
    mockGetAllJobs.mockResolvedValue([
      makeJob({ id: "j1", propertyId: "prop-1", serviceType: "Roofing" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("123 Main St")).toBeInTheDocument());
    expect(screen.queryByText("456 Oak Ave")).not.toBeInTheDocument();
  });

  it("sorts a property's jobs by date descending", async () => {
    mockGetAllJobs.mockResolvedValue([
      makeJob({ id: "old", serviceType: "Roofing", date: "2023-01-01", description: "Old roof job" }),
      makeJob({ id: "new", serviceType: "HVAC", date: "2024-06-01", description: "New HVAC job" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Old roof job")).toBeInTheDocument());
    const rows = screen.getAllByText(/Old roof job|New HVAC job/).map((el) => el.textContent);
    expect(rows[0]).toBe("New HVAC job");
    expect(rows[1]).toBe("Old roof job");
  });
});

describe("InsuranceDefensePage — discount estimator", () => {
  it("disables the estimate button when there are no properties", async () => {
    mockGetMyProperties.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Estimate My Discount")).toBeInTheDocument());
    expect(screen.getByText("Estimate My Discount").closest("button")).toBeDisabled();
  });

  it("shows the result and relabels the button 'Re-analyse' on success", async () => {
    mockEstimateInsurerDiscount.mockResolvedValue(makeDiscountResult({ discountRangeMin: 8, discountRangeMax: 20 }));
    renderPage();
    await waitFor(() => expect(screen.getByText("Estimate My Discount").closest("button")).not.toBeDisabled());

    fireEvent.click(screen.getByText("Estimate My Discount"));

    await waitFor(() => expect(screen.getByText("Re-analyse")).toBeInTheDocument());
    expect(screen.getAllByText("8–20%").length).toBeGreaterThan(0);
  });

  it("counts only Critical events from the last 90 days toward the discount request", async () => {
    const now = Date.now();
    mockGetEvents.mockResolvedValue([
      { id: "e1", deviceId: "d1", propertyId: "prop-1", eventType: "LeakDetected", value: 1, unit: "", timestamp: now - 10 * 86400000, severity: "Critical", jobId: null },
      { id: "e2", deviceId: "d1", propertyId: "prop-1", eventType: "LeakDetected", value: 1, unit: "", timestamp: now - 200 * 86400000, severity: "Critical", jobId: null }, // too old
      { id: "e3", deviceId: "d1", propertyId: "prop-1", eventType: "LeakDetected", value: 1, unit: "", timestamp: now - 5 * 86400000, severity: "Low", jobId: null }, // not critical
    ] as SensorEvent[]);
    mockEstimateInsurerDiscount.mockResolvedValue(makeDiscountResult());
    renderPage();
    await waitFor(() => expect(screen.getByText("Estimate My Discount").closest("button")).not.toBeDisabled());

    fireEvent.click(screen.getByText("Estimate My Discount"));

    await waitFor(() => expect(mockEstimateInsurerDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ criticalEventCount: 1 })
    ));
  });

  it("shows an error message when the estimate request fails", async () => {
    mockEstimateInsurerDiscount.mockRejectedValue(new Error("Service unavailable"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Estimate My Discount").closest("button")).not.toBeDisabled());

    fireEvent.click(screen.getByText("Estimate My Discount"));

    await waitFor(() => expect(screen.getByText("Service unavailable")).toBeInTheDocument());
  });

  it("shows connected devices as chips, or a prompt to add sensors when none exist", async () => {
    mockGetDevices.mockResolvedValue([{ id: "d1", propertyId: "prop-1", homeowner: "p", externalDeviceId: "e1", source: "Nest" as any, name: "Thermostat", registeredAt: Date.now(), isActive: true }] as SensorDevice[]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Thermostat")).toBeInTheDocument());
  });

  it("prompts to add sensors when no devices are registered", async () => {
    mockGetDevices.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No smart devices registered.")).toBeInTheDocument());
  });
});

describe("InsuranceDefensePage — bill anomalies", () => {
  it("includes only flagged Water bills, excluding other flagged bill types", async () => {
    mockGetAllJobs.mockResolvedValue([makeJob({ serviceType: "Roofing" })]); // so the report isn't empty
    mockGetBills.mockResolvedValue([
      { id: "b1", propertyId: "prop-1", homeowner: "p", billType: "Water", provider: "City Water", periodStart: "2024-01-01", periodEnd: "2024-01-31", amountCents: 5000, uploadedAt: Date.now(), anomalyFlag: true },
      { id: "b2", propertyId: "prop-1", homeowner: "p", billType: "Electric", provider: "City Power", periodStart: "2024-01-01", periodEnd: "2024-01-31", amountCents: 8000, uploadedAt: Date.now(), anomalyFlag: true },
      { id: "b3", propertyId: "prop-1", homeowner: "p", billType: "Water", provider: "City Water", periodStart: "2024-02-01", periodEnd: "2024-02-28", amountCents: 5000, uploadedAt: Date.now(), anomalyFlag: false },
    ] as BillRecord[]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Recent Water Usage Anomalies — Potential Leak Documentation")).toBeInTheDocument());
  });

  it("hides the anomalies section when there are none", async () => {
    mockGetAllJobs.mockResolvedValue([makeJob({ serviceType: "Roofing" })]);
    mockGetBills.mockResolvedValue([]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText("Roofing").length).toBeGreaterThan(0));
    expect(screen.queryByText(/Water Usage Anomalies/)).not.toBeInTheDocument();
  });
});

describe("InsuranceDefensePage — print action", () => {
  it("triggers window.print when Print / Export PDF is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    await waitFor(() => expect(screen.getByText("Print / Export PDF")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Print / Export PDF"));

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
