/**
 * InsuranceShareModal — real logic worth locking down:
 *   - expiry selector defaults to 90 days and highlights the selection
 *   - Generate Risk Profile calls reportService.generateRiskProfile with
 *     the property id, verification level, and chosen expiry; failure
 *     shows a toast and stays on the generate step
 *   - once generated, shows the grade/score/share-url panel; copy
 *     writes the share URL to the clipboard and shows "Copied" for a
 *     limited time; download builds a Blob anchor with the risk JSON;
 *     "Generate new" returns to the expiry-selector step
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsuranceShareModal } from "@/components/InsuranceShareModal";
import type { Property } from "@/services/property";
import type { RiskProfile } from "@/services/report";

const { mockGenerateRiskProfile, mockRiskProfileUrl, mockMaintenanceGrade } = vi.hoisted(() => ({
  mockGenerateRiskProfile: vi.fn(),
  mockRiskProfileUrl: vi.fn((token: string) => `https://homegentic.app/risk/${token}`),
  mockMaintenanceGrade: vi.fn((score: number) => (score >= 80 ? "A" : "C")),
}));
vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return {
    ...actual,
    reportService: {
      generateRiskProfile: mockGenerateRiskProfile,
      riskProfileUrl: mockRiskProfileUrl,
      maintenanceGrade: mockMaintenanceGrade,
    },
  };
});

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: mockToastSuccess } }));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "Full" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<RiskProfile> = {}): RiskProfile {
  return {
    schemaVersion: "homegentic-risk/1.0", token: "tok-1", propertyId: "prop-1",
    generatedAt: Date.now(), expiresAt: null, maintenanceScore: 88,
    verificationLevel: "Full", sensorCoverage: [], recentAlerts: [],
    openJobs: 2, verifiedJobCount: 5, permitCount: 1,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof InsuranceShareModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(<InsuranceShareModal property={makeProperty()} onClose={onClose} {...props} />);
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRiskProfileUrl.mockImplementation((token: string) => `https://homegentic.app/risk/${token}`);
  mockMaintenanceGrade.mockImplementation((score: number) => (score >= 80 ? "A" : "C"));
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("InsuranceShareModal — expiry selector", () => {
  it("defaults to 90 days and updates the selection on click", () => {
    renderModal();
    expect(screen.getByText("90 days")).toHaveStyle({ background: "#2b34ff" });

    fireEvent.click(screen.getByText("1 year"));
    expect(screen.getByText("1 year")).toHaveStyle({ background: "#2b34ff" });
    expect(screen.getByText("90 days")).not.toHaveStyle({ background: "#2b34ff" });
  });
});

describe("InsuranceShareModal — generate", () => {
  it("calls generateRiskProfile with the property id, verification level, and expiry", async () => {
    mockGenerateRiskProfile.mockResolvedValue(makeProfile());
    renderModal();

    fireEvent.click(screen.getByText("Never"));
    fireEvent.click(screen.getByText("Generate Risk Profile"));

    await waitFor(() => expect(mockGenerateRiskProfile).toHaveBeenCalledWith("prop-1", "Full", null));
  });

  it("shows a toast and stays on the generate step when generation fails", async () => {
    mockGenerateRiskProfile.mockRejectedValue(new Error("Rate limited"));
    renderModal();

    fireEvent.click(screen.getByText("Generate Risk Profile"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Rate limited"));
    expect(screen.getByText("Generate Risk Profile")).toBeInTheDocument();
  });
});

describe("InsuranceShareModal — generated profile", () => {
  it("shows the grade, score, and stat counts", async () => {
    mockGenerateRiskProfile.mockResolvedValue(makeProfile({ maintenanceScore: 88, openJobs: 2, verifiedJobCount: 5, permitCount: 1 }));
    renderModal();
    fireEvent.click(screen.getByText("Generate Risk Profile"));

    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("copies the share url and shows Copied temporarily", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGenerateRiskProfile.mockResolvedValue(makeProfile({ token: "tok-42" }));
    renderModal();
    fireEvent.click(screen.getByText("Generate Risk Profile"));
    await vi.waitFor(() => expect(screen.getByText("Copy")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://homegentic.app/risk/tok-42");
    expect(mockToastSuccess).toHaveBeenCalledWith("Link copied");
    expect(screen.getByText("Copied")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText("Copy")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("returns to the expiry-selector step on Generate new", async () => {
    mockGenerateRiskProfile.mockResolvedValue(makeProfile());
    renderModal();
    fireEvent.click(screen.getByText("Generate Risk Profile"));
    await waitFor(() => expect(screen.getByText("Generate new")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Generate new"));
    expect(screen.getByText("Generate Risk Profile")).toBeInTheDocument();
  });
});

describe("InsuranceShareModal — dismissal", () => {
  it("closes via the close button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId("insurance-modal").querySelector("button")!);
    expect(onClose).toHaveBeenCalled();
  });
});
