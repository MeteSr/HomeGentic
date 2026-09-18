/**
 * FsboListingPage — real logic worth locking down:
 *   - shows "Not Listed For Sale" when the property has no active FSBO record
 *   - renders the real computeScore() and only verified jobs in the record list
 *   - ShowingRequestForm rejects an invalid contact and only submits once valid
 *   - a successful submission creates the request + notification and shows
 *     the confirmation message
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import FsboListingPage, { ShowingRequestForm } from "@/pages/FsboListingPage";
import { computeScore } from "@/services/scoreService";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

const {
  mockGetProperty, mockGetByProperty, mockGetRecord, mockListShareLinks,
  mockGetPanoramas, mockShowingCreate, mockNotificationCreate,
} = vi.hoisted(() => ({
  mockGetProperty: vi.fn(),
  mockGetByProperty: vi.fn(),
  mockGetRecord: vi.fn(),
  mockListShareLinks: vi.fn(),
  mockGetPanoramas: vi.fn(),
  mockShowingCreate: vi.fn(),
  mockNotificationCreate: vi.fn(),
}));

vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getProperty: mockGetProperty } };
});
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getByProperty: mockGetByProperty } };
});
vi.mock("@/services/fsbo", () => ({ fsboService: { getRecord: mockGetRecord } }));
vi.mock("@/services/report", () => ({ reportService: { listShareLinks: mockListShareLinks } }));
vi.mock("@/services/listing", () => ({ listingService: { getPanoramas: mockGetPanoramas } }));
vi.mock("@/services/showingRequest", () => ({ showingRequestService: { create: mockShowingCreate } }));
vi.mock("@/services/notifications", () => ({ notificationService: { create: mockNotificationCreate } }));
vi.mock("@/components/ListingPhotoManager", () => ({ default: () => <div data-testid="gallery" /> }));
vi.mock("@/components/PlayCanvas360Viewer", () => ({ default: () => <div data-testid="tour" /> }));

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

function renderAt(propertyId: string) {
  return render(
    <MemoryRouter initialEntries={[`/for-sale/${propertyId}`]}>
      <Routes><Route path="/for-sale/:propertyId" element={<FsboListingPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPanoramas.mockResolvedValue([]);
});

describe("FsboListingPage — not for sale", () => {
  it("shows 'Not Listed For Sale' when there is no active FSBO record", async () => {
    mockGetRecord.mockReturnValue(null);
    mockGetProperty.mockResolvedValue(makeProperty());
    mockGetByProperty.mockResolvedValue([]);
    renderAt("prop-1");
    expect(await screen.findByText("Not Listed For Sale")).toBeInTheDocument();
  });

  it("shows 'Not Listed For Sale' when isFsbo is false", async () => {
    mockGetRecord.mockReturnValue({ isFsbo: false, hasReport: false });
    mockGetProperty.mockResolvedValue(makeProperty());
    mockGetByProperty.mockResolvedValue([]);
    renderAt("prop-1");
    expect(await screen.findByText("Not Listed For Sale")).toBeInTheDocument();
  });
});

describe("FsboListingPage — listed", () => {
  it("renders price, address, and the real computeScore() for the property", async () => {
    const property = makeProperty();
    const jobs = [makeJob({ verified: true }), makeJob({ id: "j2", verified: false, status: "pending" as any })];
    mockGetRecord.mockReturnValue({ isFsbo: true, hasReport: false, listPriceCents: 45_000_000, description: "" });
    mockGetProperty.mockResolvedValue(property);
    mockGetByProperty.mockResolvedValue(jobs);
    renderAt("prop-1");

    expect(await screen.findByText("$450,000")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    const expectedScore = computeScore(jobs, [property]);
    expect(screen.getByText(String(expectedScore))).toBeInTheDocument();
  });

  it("only lists verified jobs in the maintenance record", async () => {
    mockGetRecord.mockReturnValue({ isFsbo: true, hasReport: false, listPriceCents: 45_000_000, description: "" });
    mockGetProperty.mockResolvedValue(makeProperty());
    mockGetByProperty.mockResolvedValue([
      makeJob({ id: "j1", verified: true, serviceType: "HVAC" }),
      makeJob({ id: "j2", verified: false, status: "pending" as any, serviceType: "Roofing" }),
    ]);
    renderAt("prop-1");

    expect(await screen.findByText(/1 verified/)).toBeInTheDocument();
  });
});

describe("ShowingRequestForm", () => {
  function renderForm() {
    return render(<ShowingRequestForm propertyId="prop-1" />);
  }

  it("rejects submission with an invalid contact", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Your Name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email or Phone"), { target: { value: "not-valid" } });
    fireEvent.change(screen.getByLabelText("Preferred Showing Time"), { target: { value: "Weekends" } });
    fireEvent.submit(screen.getByLabelText("Showing Request"));

    expect(mockShowingCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email or phone number")).toBeInTheDocument();
  });

  it("creates the showing request and notification, then shows confirmation", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Your Name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email or Phone"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Preferred Showing Time"), { target: { value: "Weekends" } });
    fireEvent.submit(screen.getByLabelText("Showing Request"));

    expect(mockShowingCreate).toHaveBeenCalledWith({ propertyId: "prop-1", name: "Jane", contact: "jane@example.com", preferredTime: "Weekends" });
    expect(mockNotificationCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "ShowingRequest", propertyId: "prop-1" }));
    expect(screen.getByText(/Request sent/)).toBeInTheDocument();
  });
});
