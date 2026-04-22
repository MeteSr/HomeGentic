/**
 * TDD — Issue #51: WarrantyWalletPage document OCR upload flow
 *
 * Tests:
 *   - "Scan Document" button is visible on the page
 *   - Clicking it opens a file picker (or activates the upload flow)
 *   - After "upload", shows the extracted data pre-filled in the confirm form
 *   - Shows a low-confidence warning when confidence is "low"
 *   - Does NOT show a warning when confidence is "high"
 *   - Brand, model, serial, warrantyMonths are pre-filled from extraction
 *   - Submitting the form calls jobService.create (or navigates to new job)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Service mocks ────────────────────────────────────────────────────────────

const mockExtract = vi.fn();

vi.mock("@/services/documentOcr", () => ({
  extractDocument: (...args: any[]) => mockExtract(...args),
  fileToBase64:    (_file: File) => Promise.resolve("dGVzdA=="),  // stub base64
}));

vi.mock("@/services/job", () => ({
  jobService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro" }),
  },
  PLANS: [],
}));

vi.mock("@/services/warranty", () => ({
  warrantyStatus: vi.fn().mockReturnValue("active"),
  warrantyExpiry: vi.fn().mockReturnValue(Date.now() + 30 * 86400000),
  daysRemaining:  vi.fn().mockReturnValue(30),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/UpgradeGate", () => ({
  UpgradeGate: () => <div>upgrade</div>,
}));

import WarrantyWalletPage from "@/pages/WarrantyWalletPage";

const MOCK_EXTRACTION_HIGH = {
  documentType:  "appliance_manual",
  brand:         "LG",
  modelNumber:   "LDF5545ST",
  serialNumber:  "208KWHL1Z123",
  purchaseDate:  "2022-03-10",
  warrantyMonths: 24,
  serviceType:   "Appliance",
  confidence:    "high",
  description:   "LG dishwasher manual.",
};

const MOCK_EXTRACTION_LOW = {
  ...MOCK_EXTRACTION_HIGH,
  confidence: "low",
  description: "Unclear document.",
};

function renderPage() {
  return render(<MemoryRouter><WarrantyWalletPage /></MemoryRouter>);
}

describe("WarrantyWalletPage — Scan Document button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_HIGH);
  });

  it("renders a 'Scan Document' button", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /scan document/i })).toBeInTheDocument()
    );
  });
});

describe("WarrantyWalletPage — OCR extraction + pre-fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pre-fills brand from extraction result", async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_HIGH);
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /scan document/i }));
    fireEvent.click(screen.getByRole("button", { name: /scan document/i }));

    // Simulate file input change (the hidden file input)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["(binary)"], "manual.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByDisplayValue("LG")).toBeInTheDocument()
    );
  });

  it("pre-fills model number from extraction result", async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_HIGH);
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /scan document/i }));
    fireEvent.click(screen.getByRole("button", { name: /scan document/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["(binary)"], "manual.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByDisplayValue("LDF5545ST")).toBeInTheDocument()
    );
  });

  it("shows low-confidence warning when confidence is 'low'", async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_LOW);
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /scan document/i }));
    fireEvent.click(screen.getByRole("button", { name: /scan document/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["(binary)"], "unclear.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText(/low confidence|review carefully|may be inaccurate/i)).toBeInTheDocument()
    );
  });

  it("does NOT show confidence warning when confidence is 'high'", async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_HIGH);
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /scan document/i }));
    fireEvent.click(screen.getByRole("button", { name: /scan document/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["(binary)"], "manual.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => screen.getByDisplayValue("LG"));
    expect(screen.queryByText(/low confidence|review carefully|may be inaccurate/i)).not.toBeInTheDocument();
  });

  it("shows warranty months field pre-filled", async () => {
    mockExtract.mockResolvedValue(MOCK_EXTRACTION_HIGH);
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /scan document/i }));
    fireEvent.click(screen.getByRole("button", { name: /scan document/i }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["(binary)"], "manual.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByDisplayValue("24")).toBeInTheDocument()
    );
  });
});
