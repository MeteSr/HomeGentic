/**
 * TDD — AddPropertyModal V2 Wizard
 *
 * V2 flow:
 *   address  → "STEP 1 OF 2 · REQUIRED" / "Where is the home?"
 *   details  → "STEP 2 OF 2 · REQUIRED" / "Year built and size."
 *   saved    → "SAVED · FREE TIER" / "Your property is saved." (hub + 4 optional task cards)
 *   photos   → "OPTIONAL · BASELINE RECORD" (from saved card)
 *   documents→ "OPTIONAL · DOCUMENTED VALUE" (from saved card)
 *   ages     → "OPTIONAL · PREDICTIONS" (from saved card)
 *   verify   → "OPTIONAL · +20 SCORE" (from saved card)
 *
 * Acceptance criteria:
 *   - Step badge visible on each step
 *   - "Continue →" on address disabled until required fields filled
 *   - "Continue →" advances address → details
 *   - "Save property" on details disabled until year + sqft filled
 *   - "Save property" calls registerProperty and advances to saved hub
 *   - Saved hub shows 4 task cards
 *   - "View property record →" calls onClose
 *   - Each task card navigates to its optional step
 *   - Optional steps have "Skip" (back to saved) and "Save & continue" (back to saved)
 *   - Verify step calls submitVerification on submit
 *   - Solar toggle shows/hides "Year installed" input
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
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
      id: "1", address: "123 Main St", city: "Austin", state: "TX",
      zipCode: "78701", propertyType: "SingleFamily", yearBuilt: BigInt(1990),
      squareFeet: BigInt(2000), verificationLevel: "Unverified", tier: "Free",
      createdAt: BigInt(0), updatedAt: BigInt(0), owner: "test",
    }),
    submitVerification: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/photo", () => ({
  photoService: {
    getQuota: vi.fn().mockResolvedValue({ used: 0, limit: 10, tier: "Free" }),
    upload:   vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/auth", () => ({
  authService: { completeOnboarding: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, id, style }: any) => (
    <input id={id} value={value} onChange={e => onChange(e.target.value)}
      data-testid="address-autocomplete" style={style} />
  ),
}));

vi.mock("@/components/PermitCoverageIndicator", () => ({ default: () => null }));

vi.mock("@/components/ConstructionPhotoUpload", () => ({
  ConstructionPhotoUpload: () => <div data-testid="doc-upload">Document upload area</div>,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
  },
  writable: true, configurable: true,
});

// Mock matchMedia (jsdom doesn't implement it)
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true, configurable: true,
    value: (query: string) => ({
      matches: false, media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

// ─── Import under test ────────────────────────────────────────────────────────

import AddPropertyModal from "@/components/AddPropertyModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockOnClose = vi.fn();

function renderWizard() {
  mockOnClose.mockReset();
  return render(
    <MemoryRouter>
      <AddPropertyModal open={true} onClose={mockOnClose} />
    </MemoryRouter>
  );
}

function fillAddressStep() {
  fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText(/city/i),     { target: { value: "Austin" } });
  fireEvent.change(screen.getByLabelText(/state/i),    { target: { value: "TX" } });
  fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: "78701" } });
}

function fillDetailsStep() {
  fireEvent.change(screen.getByLabelText(/year built/i),  { target: { value: "1990" } });
  fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
}

async function goToDetails() {
  renderWizard();
  fillAddressStep();
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => screen.getByText(/step 2 of 2/i));
}

async function goToSaved() {
  await goToDetails();
  fillDetailsStep();
  fireEvent.click(screen.getByRole("button", { name: /save property/i }));
  await waitFor(() => screen.getByText(/your property is saved/i));
}

// ─── Step badges ──────────────────────────────────────────────────────────────

describe("AddPropertyModal V2 — step badges", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("shows 'STEP 1 OF 2' badge on address step", () => {
    renderWizard();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
  });

  it("shows 'STEP 2 OF 2' badge on details step", async () => {
    await goToDetails();
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
  });

  it("shows 'SAVED' badge on saved step", async () => {
    await goToSaved();
    expect(screen.getByText(/saved · free tier/i)).toBeInTheDocument();
  });
});

// ─── Step headings ────────────────────────────────────────────────────────────

describe("AddPropertyModal V2 — step headings", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("shows address heading on step 1", () => {
    renderWizard();
    expect(screen.getByRole("heading", { name: /where is the home/i })).toBeInTheDocument();
  });

  it("shows details heading on step 2", async () => {
    await goToDetails();
    expect(screen.getByRole("heading", { name: /year built and size/i })).toBeInTheDocument();
  });

  it("shows saved heading on saved step", async () => {
    await goToSaved();
    expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument();
  });
});

// ─── Address step validation ──────────────────────────────────────────────────

describe("AddPropertyModal V2 — address step validation", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("Continue button disabled when fields are empty", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button enabled when all address fields are filled", () => {
    renderWizard();
    fillAddressStep();
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("Continue button disabled with invalid state abbreviation", () => {
    renderWizard();
    fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/city/i),     { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText(/state/i),    { target: { value: "XX" } });
    fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: "78701" } });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button disabled with invalid ZIP code", () => {
    renderWizard();
    fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByLabelText(/city/i),     { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText(/state/i),    { target: { value: "TX" } });
    fireEvent.change(screen.getByLabelText(/zip code/i), { target: { value: "1234" } });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});

// ─── Details step validation ──────────────────────────────────────────────────

describe("AddPropertyModal V2 — details step validation", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToDetails();
  });

  it("Save property button is disabled when year built is empty", () => {
    fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
    expect(screen.getByRole("button", { name: /save property/i })).toBeDisabled();
  });

  it("Save property button is disabled when square feet is empty", () => {
    fireEvent.change(screen.getByLabelText(/year built/i), { target: { value: "1990" } });
    expect(screen.getByRole("button", { name: /save property/i })).toBeDisabled();
  });

  it("Save property button is enabled when year and sqft are filled", () => {
    fillDetailsStep();
    expect(screen.getByRole("button", { name: /save property/i })).not.toBeDisabled();
  });

  it("Back button returns to address step", async () => {
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument());
  });
});

// ─── Save property API call ───────────────────────────────────────────────────

describe("AddPropertyModal V2 — save property", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("calls registerProperty with correct data", async () => {
    await goToSaved();
    const { propertyService } = await import("@/services/property");
    expect(propertyService.registerProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "123 Main St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        yearBuilt: 1990,
        squareFeet: 2000,
      })
    );
  });
});

// ─── Saved hub ────────────────────────────────────────────────────────────────

describe("AddPropertyModal V2 — saved hub", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToSaved();
  });

  it("shows the record score", () => {
    // The score section has a specific base score of 20 after saving
    expect(screen.getAllByText(/record score/i).length).toBeGreaterThan(0);
  });

  it("shows 4 optional task cards", () => {
    const cards = screen.getByTestId("task-cards");
    expect(within(cards).getByText("Verify ownership")).toBeInTheDocument();
    expect(within(cards).getByText("Baseline photos")).toBeInTheDocument();
    expect(within(cards).getByText("Import documents")).toBeInTheDocument();
    expect(within(cards).getByText("System ages")).toBeInTheDocument();
  });

  it("shows 'View property record' button", () => {
    expect(screen.getByRole("button", { name: /view property record/i })).toBeInTheDocument();
  });

  it("'View property record' calls onClose", async () => {
    fireEvent.click(screen.getByRole("button", { name: /view property record/i }));
    await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
  });

  it("'Baseline photos' task card navigates to photos step", async () => {
    fireEvent.click(screen.getByText(/open camera guide/i));
    await waitFor(() => expect(screen.getByRole("heading", { name: /capture baseline photos/i })).toBeInTheDocument());
  });

  it("'Import documents' task card navigates to documents step", async () => {
    fireEvent.click(screen.getByText(/import files/i));
    await waitFor(() => expect(screen.getByRole("heading", { name: /import documents/i })).toBeInTheDocument());
  });

  it("'System ages' task card navigates to ages step", async () => {
    fireEvent.click(screen.getByText(/fill in ages/i));
    await waitFor(() => expect(screen.getByRole("heading", { name: /how old are your systems/i })).toBeInTheDocument());
  });

  it("'Verify ownership' task card navigates to verify step", async () => {
    fireEvent.click(screen.getByText(/start verification/i));
    await waitFor(() => expect(screen.getByRole("heading", { name: /verify ownership/i })).toBeInTheDocument());
  });
});

// ─── Photos optional step ─────────────────────────────────────────────────────

describe("AddPropertyModal V2 — photos step", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToSaved();
    fireEvent.click(screen.getByText(/open camera guide/i));
    await waitFor(() => screen.getByRole("heading", { name: /capture baseline photos/i }));
  });

  it("shows 'OPTIONAL · BASELINE RECORD' badge", () => {
    expect(screen.getByText(/optional · baseline record/i)).toBeInTheDocument();
  });

  it("shows all 6 baseline system categories", () => {
    expect(screen.getAllByText(/HVAC/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water Heater/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Electrical Panel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water Shut-off/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Roof/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Garage Door/i).length).toBeGreaterThan(0);
  });

  it("shows 0 / 6 counter in the photos step header", () => {
    // The header counter text (distinct from the left rail "0 / 6" nav sub-text)
    expect(screen.getAllByText("0 / 6").length).toBeGreaterThan(0);
  });

  it("shows 6 'Add photo' buttons", () => {
    expect(screen.getAllByRole("button", { name: /add photo/i })).toHaveLength(6);
  });

  it("'Save & continue' returns to saved hub", async () => {
    fireEvent.click(screen.getByRole("button", { name: /save & continue/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });

  it("'Skip' returns to saved hub", async () => {
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });
});

// ─── Documents optional step ──────────────────────────────────────────────────

describe("AddPropertyModal V2 — documents step", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToSaved();
    fireEvent.click(screen.getByText(/import files/i));
    await waitFor(() => screen.getByRole("heading", { name: /import documents/i }));
  });

  it("renders the document upload area", () => {
    expect(screen.getByTestId("doc-upload")).toBeInTheDocument();
  });

  it("'Skip' returns to saved hub", async () => {
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });
});

// ─── Ages optional step ───────────────────────────────────────────────────────

describe("AddPropertyModal V2 — system ages step", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToSaved();
    fireEvent.click(screen.getByText(/fill in ages/i));
    await waitFor(() => screen.getByRole("heading", { name: /how old are your systems/i }));
  });

  it("shows HVAC input", () => {
    expect(screen.getByLabelText(/hvac/i)).toBeInTheDocument();
  });

  it("shows Roof input", () => {
    expect(screen.getByLabelText(/^roof$/i)).toBeInTheDocument();
  });

  it("shows Water Heater input", () => {
    expect(screen.getByLabelText(/water heater/i)).toBeInTheDocument();
  });

  it("shows Electrical Panel input", () => {
    expect(screen.getByLabelText(/electrical panel/i)).toBeInTheDocument();
  });

  it("shows Plumbing input", () => {
    expect(screen.getByLabelText(/^plumbing$/i)).toBeInTheDocument();
  });

  it("solar checkbox is unchecked by default", () => {
    expect(screen.getByLabelText(/solar panels/i)).not.toBeChecked();
  });

  it("year installed input is NOT visible when solar is unchecked", () => {
    expect(screen.queryByPlaceholderText(/year installed/i)).not.toBeInTheDocument();
  });

  it("checking solar reveals the year installed input", () => {
    fireEvent.click(screen.getByLabelText(/solar panels/i));
    expect(screen.getByPlaceholderText(/year installed/i)).toBeInTheDocument();
  });

  it("unchecking solar hides year installed input", () => {
    fireEvent.click(screen.getByLabelText(/solar panels/i)); // on
    fireEvent.click(screen.getByLabelText(/solar panels/i)); // off
    expect(screen.queryByPlaceholderText(/year installed/i)).not.toBeInTheDocument();
  });

  it("'Skip' returns to saved hub", async () => {
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });
});

// ─── Verify optional step ─────────────────────────────────────────────────────

describe("AddPropertyModal V2 — verify ownership step", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); mockNavigate.mockReset();
    await goToSaved();
    fireEvent.click(screen.getByText(/start verification/i));
    await waitFor(() => screen.getByRole("heading", { name: /verify ownership/i }));
  });

  it("shows the verify heading", () => {
    expect(screen.getByRole("heading", { name: /verify ownership/i })).toBeInTheDocument();
  });

  it("Submit button disabled when legal name is empty", () => {
    const file = new File(["deed"], "deed.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/ownership document/i), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /submit for review/i })).toBeDisabled();
  });

  it("Submit button disabled when no document selected", () => {
    fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: "John Doe" } });
    expect(screen.getByRole("button", { name: /submit for review/i })).toBeDisabled();
  });

  it("Submit button enabled when legal name and doc are provided", () => {
    fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: "John Doe" } });
    const file = new File(["deed"], "deed.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/ownership document/i), { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /submit for review/i })).not.toBeDisabled();
  });

  it("submitting calls submitVerification and returns to saved hub", async () => {
    const { propertyService } = await import("@/services/property");
    fireEvent.change(screen.getByLabelText(/legal name/i), { target: { value: "John Doe" } });
    const file = new File(["deed"], "deed.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/ownership document/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    await waitFor(() => expect(propertyService.submitVerification).toHaveBeenCalledWith(
      "1", expect.any(String), expect.any(String)
    ));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });

  it("'← Back' returns to saved hub", async () => {
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /your property is saved/i })).toBeInTheDocument());
  });
});

// ─── Close button ─────────────────────────────────────────────────────────────

describe("AddPropertyModal V2 — close button", () => {
  beforeEach(() => { vi.clearAllMocks(); mockNavigate.mockReset(); });

  it("X button calls onClose", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("does not render when open=false", () => {
    render(
      <MemoryRouter>
        <AddPropertyModal open={false} onClose={mockOnClose} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
