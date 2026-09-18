/**
 * WarrantyWalletPage — real logic worth locking down:
 *   - only jobs with a positive warrantyMonths are shown, grouped into
 *     Expiring Soon / Active / Expired via the real warrantyStatus
 *     helper (not mocked — it's exactly what this page displays)
 *   - the empty state shows when there are no warrantied jobs
 *   - the document-scan flow: uploading a file extracts data and
 *     pre-fills the confirm form, a low-confidence extraction shows a
 *     warning banner, submitting shows a "registered" confirmation,
 *     and a failed extraction shows its error and returns to idle
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import WarrantyWalletPage from "@/pages/WarrantyWalletPage";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import type { DocumentExtraction } from "@/services/documentOcr";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockGetAllJobs, mockGetMyProperties } = vi.hoisted(() => ({
  mockGetAllJobs: vi.fn(),
  mockGetMyProperties: vi.fn(),
}));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getAll: mockGetAllJobs } };
});
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getMyProperties: mockGetMyProperties } };
});

const { mockExtractDocument, mockFileToBase64 } = vi.hoisted(() => ({
  mockExtractDocument: vi.fn(),
  mockFileToBase64: vi.fn(),
}));
vi.mock("@/services/documentOcr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/documentOcr")>();
  return { ...actual, extractDocument: mockExtractDocument, fileToBase64: mockFileToBase64 };
});

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "New unit", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeExtraction(overrides: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    documentType: "warranty" as any, brand: "Carrier", modelNumber: "M-100",
    serialNumber: "SN-1", purchaseDate: "2024-01-01", warrantyMonths: 24,
    serviceType: "HVAC", confidence: "high" as any, description: "Warranty card for HVAC unit",
    ...overrides,
  };
}

function renderPage() {
  return render(<MemoryRouter><WarrantyWalletPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyProperties.mockResolvedValue([makeProperty()]);
});

describe("WarrantyWalletPage — grouping", () => {
  it("shows the empty state when no jobs have a warranty", async () => {
    mockGetAllJobs.mockResolvedValue([makeJob({ warrantyMonths: undefined })]);
    renderPage();
    expect(await screen.findByText("No warranties logged yet")).toBeInTheDocument();
  });

  it("groups jobs into Expired vs Active using the real warrantyStatus helper", async () => {
    const expiredJob = makeJob({ id: "j-expired", date: "2020-01-01", warrantyMonths: 12, serviceType: "Roofing" });
    const activeJob = makeJob({ id: "j-active", date: new Date().toISOString().slice(0, 10), warrantyMonths: 120, serviceType: "Plumbing" });
    mockGetAllJobs.mockResolvedValue([expiredJob, activeJob]);
    renderPage();

    await screen.findByText("Plumbing");
    const roofingRow = screen.getByText("Roofing").closest("div[style*='display: flex']")!;
    expect(within(roofingRow as HTMLElement).getByText("Expired")).toBeInTheDocument();
    const plumbingRow = screen.getByText("Plumbing").closest("div[style*='display: flex']")!;
    expect(within(plumbingRow as HTMLElement).getByText("Active")).toBeInTheDocument();
  });
});

describe("WarrantyWalletPage — document scan", () => {
  it("extracts a scanned document and pre-fills the confirm form", async () => {
    mockGetAllJobs.mockResolvedValue([]);
    mockFileToBase64.mockResolvedValue("base64data");
    mockExtractDocument.mockResolvedValue(makeExtraction());
    renderPage();
    await screen.findByText("No warranties logged yet");

    const file = new File(["x"], "warranty.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByDisplayValue("Carrier")).toBeInTheDocument();
    expect(screen.getByDisplayValue("M-100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("24")).toBeInTheDocument();
  });

  it("shows a low-confidence warning banner", async () => {
    mockGetAllJobs.mockResolvedValue([]);
    mockFileToBase64.mockResolvedValue("base64data");
    mockExtractDocument.mockResolvedValue(makeExtraction({ confidence: "low" as any }));
    renderPage();

    const file = new File(["x"], "warranty.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText(/Low confidence — review carefully/)).toBeInTheDocument();
  });

  it("shows a confirmation after saving to wallet", async () => {
    mockGetAllJobs.mockResolvedValue([]);
    mockFileToBase64.mockResolvedValue("base64data");
    mockExtractDocument.mockResolvedValue(makeExtraction());
    renderPage();

    const file = new File(["x"], "warranty.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(await screen.findByText("Save to Wallet"));

    expect(await screen.findByText(/Document registered/)).toBeInTheDocument();
  });

  it("shows the extraction error and returns to idle on failure", async () => {
    mockGetAllJobs.mockResolvedValue([]);
    mockFileToBase64.mockResolvedValue("base64data");
    mockExtractDocument.mockRejectedValue(new Error("Could not read document"));
    renderPage();

    const file = new File(["x"], "warranty.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText("Could not read document")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Scan Document/ })).toBeInTheDocument());
  });
});
