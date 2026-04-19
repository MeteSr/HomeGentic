/**
 * TDD — Issue #129: Onboarding Wizard
 *
 * Replaces the modal-collection OnboardingPage with a linear wizard.
 * Steps:
 *   1 — Property address
 *   2 — Property details (type, year built, sq ft)
 *   3 — Document import  (optional)
 *   4 — System ages      (optional)
 *
 * Acceptance criteria:
 *   - Step indicator ("Step X of 4") visible throughout
 *   - No Back button on step 1; Back available on steps 2–4
 *   - Next advances; Back retreats
 *   - "Skip setup" link navigates to /dashboard from any step
 *   - Step 4 shows "Finish" (not "Next")
 *   - Finishing navigates to /dashboard
 *   - Step 1 Next is disabled until required address fields are filled
 *   - Step 2 Next is disabled until type, year, and sq ft are filled
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({
    principal: "test", profile: { role: "Homeowner", email: "test@example.com" },
    isAuthenticated: true, tier: null, setTier: vi.fn(), setProfile: vi.fn(),
  }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ addProperty: vi.fn(), setProperties: vi.fn() }),
}));

vi.mock("@/services/property", () => ({
  propertyService: {
    registerProperty: vi.fn().mockResolvedValue({
      id: BigInt(1), address: "123 Main St", city: "Austin", state: "TX",
      zipCode: "78701", propertyType: "SingleFamily", yearBuilt: BigInt(1990),
      squareFeet: BigInt(2000), verificationLevel: "Unverified", tier: "Free",
      createdAt: BigInt(0), updatedAt: BigInt(0), owner: "test",
    }),
  },
}));

vi.mock("@/services/photo", () => ({
  photoService: {
    getQuota: vi.fn().mockResolvedValue({ used: 0, limit: 10, tier: "Free" }),
    upload:   vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/systemAges", () => ({
  systemAgesService: { save: vi.fn(), load: vi.fn().mockReturnValue(null) },
}));

vi.mock("@/services/propertyLookup", () => ({
  lookupPropertyDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/permitImport", () => ({
  triggerPermitImport:  vi.fn().mockResolvedValue({ citySupported: false, permits: [] }),
  createJobsFromPermits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, id, className }: any) => (
    <input id={id} className={className} value={value}
      onChange={(e) => onChange(e.target.value)} data-testid="address-autocomplete" />
  ),
}));

vi.mock("@/components/PermitCoverageIndicator",  () => ({ default: () => null }));
vi.mock("@/components/PermitImportReviewPanel",  () => ({ default: () => null }));
vi.mock("@/components/ConstructionPhotoUpload",  () => ({
  ConstructionPhotoUpload: () => <div data-testid="doc-upload">Document upload area</div>,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import OnboardingWizard from "@/pages/OnboardingWizard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWizard() {
  return render(
    <MemoryRouter>
      <OnboardingWizard />
    </MemoryRouter>
  );
}

/** Fill every required field on step 1 */
function fillStep1() {
  fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText(/city/i),  { target: { value: "Austin" } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TX" } });
  fireEvent.change(screen.getByLabelText(/zip/i),   { target: { value: "78701" } });
}

/** Fill required fields on step 2 (property type is pre-selected) */
function fillStep2() {
  fireEvent.change(screen.getByLabelText(/year built/i),   { target: { value: "1990" } });
  fireEvent.change(screen.getByLabelText(/square feet/i),  { target: { value: "2000" } });
}

/** Click the primary "Next" advance button */
function clickNext() {
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}

/** Advance through all 4 steps, stopping just before each */
async function goToStep(n: 2 | 3 | 4) {
  renderWizard();
  fillStep1();
  clickNext();
  await waitFor(() => screen.getByText(/step 2 of 4/i));
  if (n === 2) return;

  fillStep2();
  clickNext();
  await waitFor(() => screen.getByText(/step 3 of 4/i));
  if (n === 3) return;

  // Step 3 is optional — click Next to proceed
  clickNext();
  await waitFor(() => screen.getByText(/step 4 of 4/i));
}

// ─── Step indicator ───────────────────────────────────────────────────────────

describe("OnboardingWizard — step indicator", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("shows 'Step 1 of 4' on initial render", () => {
    renderWizard();
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
  });

  it("shows 'Step 2 of 4' after advancing from step 1", async () => {
    renderWizard();
    fillStep1();
    clickNext();
    await waitFor(() => expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument());
  });

  it("shows 'Step 3 of 4' after advancing from step 2", async () => {
    await goToStep(3);
    expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument();
  });

  it("shows 'Step 4 of 4' after advancing from step 3", async () => {
    await goToStep(4);
    expect(screen.getByText(/step 4 of 4/i)).toBeInTheDocument();
  });
});

// ─── Back button visibility ───────────────────────────────────────────────────

describe("OnboardingWizard — Back button", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("does NOT show Back button on step 1", () => {
    renderWizard();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("shows Back button on step 2", async () => {
    await goToStep(2);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("shows Back button on step 3", async () => {
    await goToStep(3);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("shows Back button on step 4", async () => {
    await goToStep(4);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("clicking Back on step 2 returns to step 1", async () => {
    await goToStep(2);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument());
  });

  it("clicking Back on step 3 returns to step 2", async () => {
    await goToStep(3);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument());
  });

  it("clicking Back on step 4 returns to step 3", async () => {
    await goToStep(4);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument());
  });
});

// ─── Step 1 validation ────────────────────────────────────────────────────────

describe("OnboardingWizard — step 1 validation", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("Next button is disabled when address fields are empty", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button is enabled when all step-1 fields are filled", () => {
    renderWizard();
    fillStep1();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("Next button stays disabled with an invalid state abbreviation", () => {
    renderWizard();
    fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/city/i),  { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "XX" } });
    fireEvent.change(screen.getByLabelText(/zip/i),   { target: { value: "78701" } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button stays disabled with an invalid ZIP code", () => {
    renderWizard();
    fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/city/i),  { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TX" } });
    fireEvent.change(screen.getByLabelText(/zip/i),   { target: { value: "1234" } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });
});

// ─── Step 2 validation ────────────────────────────────────────────────────────

describe("OnboardingWizard — step 2 validation", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(2);
  });

  it("Next button is disabled when year built is empty", () => {
    fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button is disabled when square feet is empty", () => {
    fireEvent.change(screen.getByLabelText(/year built/i), { target: { value: "1990" } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button is enabled when year and sq ft are filled", () => {
    fillStep2();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });
});

// ─── Step 3: optional document upload ────────────────────────────────────────

describe("OnboardingWizard — step 3 document upload", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(3);
  });

  it("renders the document upload area", () => {
    expect(screen.getByTestId("doc-upload")).toBeInTheDocument();
  });

  it("Next button is enabled on step 3 without any upload (optional)", () => {
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });
});

// ─── Step 4: Finish button ────────────────────────────────────────────────────

describe("OnboardingWizard — step 4 Finish button", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(4);
  });

  it("shows 'Finish' button on step 4 instead of 'Next'", () => {
    expect(screen.getByRole("button", { name: /^finish$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^next$/i })).not.toBeInTheDocument();
  });

  it("clicking Finish navigates to /dashboard", async () => {
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });
});

// ─── Skip setup link ──────────────────────────────────────────────────────────

describe("OnboardingWizard — Skip setup link", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("shows a 'Skip setup' link on step 1", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /skip setup/i })).toBeInTheDocument();
  });

  it("clicking 'Skip setup' navigates to /dashboard from step 1", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /skip setup/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("shows 'Skip setup' link on step 2", async () => {
    await goToStep(2);
    expect(screen.getByRole("button", { name: /skip setup/i })).toBeInTheDocument();
  });

  it("clicking 'Skip setup' from step 2 navigates to /dashboard", async () => {
    await goToStep(2);
    fireEvent.click(screen.getByRole("button", { name: /skip setup/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

describe("OnboardingWizard — progress bar", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("renders a progress bar element", () => {
    renderWizard();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("progress bar shows 25% on step 1", () => {
    renderWizard();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  });

  it("progress bar shows 50% on step 2", async () => {
    await goToStep(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("progress bar shows 75% on step 3", async () => {
    await goToStep(3);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("progress bar shows 100% on step 4", async () => {
    await goToStep(4);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

// ─── Step content headings ────────────────────────────────────────────────────

describe("OnboardingWizard — step content headings", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("step 1 shows property address heading", () => {
    renderWizard();
    expect(screen.getByRole("heading", { name: /property address/i })).toBeInTheDocument();
  });

  it("step 2 shows property details heading", async () => {
    await goToStep(2);
    expect(screen.getByRole("heading", { name: /property details/i })).toBeInTheDocument();
  });

  it("step 3 shows document import heading", async () => {
    await goToStep(3);
    expect(screen.getByRole("heading", { name: /import documents/i })).toBeInTheDocument();
  });

  it("step 4 shows system ages heading", async () => {
    await goToStep(4);
    expect(screen.getByRole("heading", { name: /system ages/i })).toBeInTheDocument();
  });
});
