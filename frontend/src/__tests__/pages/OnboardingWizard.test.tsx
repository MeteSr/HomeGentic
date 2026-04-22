/**
 * TDD — Issue #129 / #134: Onboarding Wizard
 *
 * Steps:
 *   1 — Property address
 *   2 — Property details (type, year built, sq ft)
 *   3 — Capture baseline photos  (optional, NEW — issue #134)
 *   4 — Verify ownership  (legal name + ownership document — required)
 *   5 — Document import   (optional)
 *   6 — System ages       (optional, defaults to year built, + solar toggle)
 *
 * Acceptance criteria:
 *   - Step indicator ("Step X of 6") visible throughout
 *   - No Back button on step 1; Back available on steps 2–6
 *   - Next advances; Back retreats
 *   - "Skip setup" link navigates to /dashboard from any step
 *   - Step 6 shows "Finish" (not "Next")
 *   - Finishing navigates to /dashboard
 *   - Step 1 Next disabled until required address fields are filled
 *   - Step 2 Next disabled until type, year, and sq ft are filled
 *   - Step 3 (baseline photos) Next always enabled (optional step)
 *   - Step 4 Next disabled until legal name and document file are provided
 *   - Step 4 calls propertyService.submitVerification on advance
 *   - Step 6 system age inputs default to year built
 *   - Step 6 solar toggle hides/shows a "Year Installed" input
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
    submitVerification: vi.fn().mockResolvedValue({
      id: BigInt(1), address: "123 Main St", city: "Austin", state: "TX",
      zipCode: "78701", propertyType: "SingleFamily", yearBuilt: BigInt(1990),
      squareFeet: BigInt(2000), verificationLevel: "PendingReview", tier: "Free",
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
  triggerPermitImport:   vi.fn().mockResolvedValue({ citySupported: false, permits: [] }),
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

// Stub crypto.subtle.digest — jsdom doesn't guarantee SubtleCrypto availability
// in all CI environments; the wizard uses it to hash ownership documents.
Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
    },
  },
  writable: true,
  configurable: true,
});

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

function fillStep1() {
  fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText(/city/i),  { target: { value: "Austin" } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TX" } });
  fireEvent.change(screen.getByLabelText(/zip/i),   { target: { value: "78701" } });
}

function fillStep2() {
  fireEvent.change(screen.getByLabelText(/year built/i),  { target: { value: "1990" } });
  fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
}

function fillStep4() {
  fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: "John Doe" } });
  const file = new File(["deed-content"], "deed.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/ownership document/i), { target: { files: [file] } });
}

function clickNext() {
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}

async function goToStep(n: 2 | 3 | 4 | 5 | 6) {
  renderWizard();
  fillStep1();
  clickNext();
  await waitFor(() => screen.getByText(/step 2 of 6/i));
  if (n === 2) return;

  fillStep2();
  clickNext();
  await waitFor(() => screen.getByText(/step 3 of 6/i));
  if (n === 3) return;

  // Step 3 (baseline photos) is optional — Next always enabled
  clickNext();
  await waitFor(() => screen.getByText(/step 4 of 6/i));
  if (n === 4) return;

  fillStep4();
  clickNext();
  await waitFor(() => screen.getByText(/step 5 of 6/i));
  if (n === 5) return;

  // Step 5 is optional document upload
  clickNext();
  await waitFor(() => screen.getByText(/step 6 of 6/i));
}

// ─── Step indicator ───────────────────────────────────────────────────────────

describe("OnboardingWizard — step indicator", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("shows 'Step 1 of 6' on initial render", () => {
    renderWizard();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
  });

  it("shows 'Step 2 of 6' after advancing from step 1", async () => {
    renderWizard();
    fillStep1();
    clickNext();
    await waitFor(() => expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument());
  });

  it("shows 'Step 3 of 6' after advancing from step 2", async () => {
    await goToStep(3);
    expect(screen.getByText(/step 3 of 6/i)).toBeInTheDocument();
  });

  it("shows 'Step 4 of 6' after advancing from step 3", async () => {
    await goToStep(4);
    expect(screen.getByText(/step 4 of 6/i)).toBeInTheDocument();
  });

  it("shows 'Step 5 of 6' after advancing from step 4", async () => {
    await goToStep(5);
    expect(screen.getByText(/step 5 of 6/i)).toBeInTheDocument();
  });

  it("shows 'Step 6 of 6' after advancing from step 5", async () => {
    await goToStep(6);
    expect(screen.getByText(/step 6 of 6/i)).toBeInTheDocument();
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

  it("shows Back button on step 5", async () => {
    await goToStep(5);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("shows Back button on step 6", async () => {
    await goToStep(6);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("clicking Back on step 2 returns to step 1", async () => {
    await goToStep(2);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument());
  });

  it("clicking Back on step 3 returns to step 2", async () => {
    await goToStep(3);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument());
  });

  it("clicking Back on step 4 returns to step 3", async () => {
    await goToStep(4);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 3 of 6/i)).toBeInTheDocument());
  });

  it("clicking Back on step 5 returns to step 4", async () => {
    await goToStep(5);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 4 of 6/i)).toBeInTheDocument());
  });

  it("clicking Back on step 6 returns to step 5", async () => {
    await goToStep(6);
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByText(/step 5 of 6/i)).toBeInTheDocument());
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

// ─── Step 3: baseline photos ──────────────────────────────────────────────────

describe("OnboardingWizard — step 3 capture baseline photos", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(3);
  });

  it("shows the Capture Baseline Photos heading", () => {
    expect(screen.getByRole("heading", { name: /capture baseline photos/i })).toBeInTheDocument();
  });

  it("shows all 6 baseline system categories", () => {
    expect(screen.getAllByText(/HVAC/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water Heater/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Electrical Panel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water Shut-off/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Roof/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Garage Door/i).length).toBeGreaterThan(0);
  });

  it("shows '0 / 6' progress count", () => {
    // The counter renders as two text nodes: the count + a "/ N" span
    expect(screen.getByText(/\/\s*6/)).toBeInTheDocument();
  });

  it("Next button is enabled without uploading anything (optional step)", () => {
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("shows an 'Add photo' button for each of the 6 systems", () => {
    expect(screen.getAllByRole("button", { name: /add photo/i })).toHaveLength(6);
  });
});

// ─── Step 4: ownership verification ──────────────────────────────────────────

describe("OnboardingWizard — step 4 ownership verification", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(4);
  });

  it("shows the Verify Ownership heading", () => {
    expect(screen.getByRole("heading", { name: /verify ownership/i })).toBeInTheDocument();
  });

  it("Next button is disabled when legal name is empty", () => {
    const file = new File(["deed"], "deed.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/ownership document/i), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button is disabled when no document is selected", () => {
    fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: "John Doe" } });
    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled();
  });

  it("Next button is enabled when legal name and document are provided", () => {
    fillStep4();
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });

  it("advancing calls submitVerification with the registered property id", async () => {
    const { propertyService } = await import("@/services/property");
    fillStep4();
    clickNext();
    await waitFor(() => screen.getByText(/step 5 of 6/i));
    expect(propertyService.submitVerification).toHaveBeenCalledWith(
      BigInt(1),
      expect.any(String), // docType
      expect.any(String), // sha-256 hash
    );
  });
});

// ─── Step 5: optional document upload ────────────────────────────────────────

describe("OnboardingWizard — step 5 document upload", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(5);
  });

  it("renders the document upload area", () => {
    expect(screen.getByTestId("doc-upload")).toBeInTheDocument();
  });

  it("Next button is enabled on step 5 without any upload (optional)", () => {
    expect(screen.getByRole("button", { name: /^next$/i })).not.toBeDisabled();
  });
});

// ─── Step 6: Finish button ────────────────────────────────────────────────────

describe("OnboardingWizard — step 6 Finish button", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(6);
  });

  it("shows 'Finish' button on step 6 instead of 'Next'", () => {
    expect(screen.getByRole("button", { name: /^finish$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^next$/i })).not.toBeInTheDocument();
  });

  it("clicking Finish navigates to /dashboard", async () => {
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"));
  });
});

// ─── Step 6: system ages default to year built ───────────────────────────────

describe("OnboardingWizard — step 6 system ages default to year built", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(6);
  });

  it("HVAC input defaults to year built (1990)", () => {
    expect(screen.getByLabelText(/hvac/i)).toHaveValue(1990);
  });

  it("Roof input defaults to year built (1990)", () => {
    expect(screen.getByLabelText(/^roof$/i)).toHaveValue(1990);
  });

  it("Water Heater input defaults to year built (1990)", () => {
    expect(screen.getByLabelText(/water heater/i)).toHaveValue(1990);
  });

  it("Electrical Panel input defaults to year built (1990)", () => {
    expect(screen.getByLabelText(/electrical panel/i)).toHaveValue(1990);
  });

  it("Plumbing input defaults to year built (1990)", () => {
    expect(screen.getByLabelText(/^plumbing$/i)).toHaveValue(1990);
  });

  it("user can override the default value", () => {
    const hvacInput = screen.getByLabelText(/hvac/i);
    fireEvent.change(hvacInput, { target: { value: "2015" } });
    expect(hvacInput).toHaveValue(2015);
  });
});

// ─── Step 6: solar panels toggle ─────────────────────────────────────────────

describe("OnboardingWizard — step 6 solar panels", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToStep(6);
  });

  it("solar panels checkbox is unchecked by default", () => {
    expect(screen.getByLabelText(/solar panels/i)).not.toBeChecked();
  });

  it("year installed input is NOT shown when solar is unchecked", () => {
    expect(screen.queryByLabelText(/year installed/i)).not.toBeInTheDocument();
  });

  it("checking solar reveals the year installed input", () => {
    fireEvent.click(screen.getByLabelText(/solar panels/i));
    expect(screen.getByLabelText(/year installed/i)).toBeInTheDocument();
  });

  it("year installed input defaults to year built (1990) when revealed", () => {
    fireEvent.click(screen.getByLabelText(/solar panels/i));
    expect(screen.getByLabelText(/year installed/i)).toHaveValue(1990);
  });

  it("unchecking solar hides the year installed input", () => {
    fireEvent.click(screen.getByLabelText(/solar panels/i)); // on
    fireEvent.click(screen.getByLabelText(/solar panels/i)); // off
    expect(screen.queryByLabelText(/year installed/i)).not.toBeInTheDocument();
  });

  it("Finish button is enabled on step 6 without solar (optional)", () => {
    expect(screen.getByRole("button", { name: /^finish$/i })).not.toBeDisabled();
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

  it("progress bar shows 17% on step 1", () => {
    renderWizard();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
  });

  it("progress bar shows 33% on step 2", async () => {
    await goToStep(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
  });

  it("progress bar shows 50% on step 3", async () => {
    await goToStep(3);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("progress bar shows 67% on step 4", async () => {
    await goToStep(4);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
  });

  it("progress bar shows 83% on step 5", async () => {
    await goToStep(5);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "83");
  });

  it("progress bar shows 100% on step 6", async () => {
    await goToStep(6);
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

  it("step 3 shows capture baseline photos heading", async () => {
    await goToStep(3);
    expect(screen.getByRole("heading", { name: /capture baseline photos/i })).toBeInTheDocument();
  });

  it("step 4 shows verify ownership heading", async () => {
    await goToStep(4);
    expect(screen.getByRole("heading", { name: /verify ownership/i })).toBeInTheDocument();
  });

  it("step 5 shows import documents heading", async () => {
    await goToStep(5);
    expect(screen.getByRole("heading", { name: /import documents/i })).toBeInTheDocument();
  });

  it("step 6 shows system ages heading", async () => {
    await goToStep(6);
    expect(screen.getByRole("heading", { name: /system ages/i })).toBeInTheDocument();
  });
});
