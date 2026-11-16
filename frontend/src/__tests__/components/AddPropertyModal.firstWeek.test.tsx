/**
 * Add Property wizard, first week:
 *  - "Did you buy this home in the last 12 months?" — yes starts the move-in plan
 *  - the system ages step saves to the home record: each system is "Original"
 *    (the year the house was built) or "Replaced" in a year; unanswered ones
 *    aren't saved
 *  - a paperwork step shows the invoice-forwarding address and points to the
 *    label scan
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/services/property", () => ({
  propertyService: { registerProperty: vi.fn(), submitVerification: vi.fn() },
}));
vi.mock("@/services/photo", () => ({
  photoService: { upload: vi.fn(), getQuota: vi.fn().mockResolvedValue({ used: 0, limit: 10, tier: "Free" }) },
}));
vi.mock("@/services/auth", () => ({ authService: { completeOnboarding: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("@/store/propertyStore", () => ({ usePropertyStore: () => ({ addProperty: vi.fn() }) }));
vi.mock("@/hooks/useBreakpoint", () => ({
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));
vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ onChange, value, id }: any) => (
    <input data-testid="address-autocomplete" id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/ConstructionPhotoUpload", () => ({ ConstructionPhotoUpload: () => <div /> }));
vi.mock("@/components/PermitCoverageIndicator", () => ({ default: () => <div /> }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { mockStart, mockSave, mockAddress, mockDomain } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockSave: vi.fn(),
  mockAddress: vi.fn(),
  mockDomain: vi.fn(),
}));
vi.mock("@/services/moveInPlan", () => ({ moveInPlanService: { start: mockStart } }));
vi.mock("@/services/systemAges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/systemAges")>();
  return { ...actual, systemAgesService: { ...actual.systemAgesService, save: mockSave } };
});
vi.mock("@/services/jobInbox", () => ({ jobInboxService: { getAddress: mockAddress, domain: mockDomain } }));

import AddPropertyModal from "@/components/AddPropertyModal";
import { propertyService } from "@/services/property";

function renderModal() {
  render(
    <MemoryRouter>
      <AddPropertyModal open onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

async function saveHome(bought?: "Yes" | "No") {
  (propertyService.registerProperty as any).mockResolvedValueOnce({ id: "p1", address: "123 Main St" });
  renderModal();
  fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "Nashville" } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TN" } });
  fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: "37201" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  fireEvent.change(screen.getByLabelText(/year built/i), { target: { value: "1990" } });
  fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
  if (bought) {
    const group = screen.getByRole("radiogroup", { name: /buy this home in the last 12 months/i });
    fireEvent.click(within(group).getByRole("radio", { name: bought }));
  }
  fireEvent.click(screen.getByRole("button", { name: /Save property/i }));
  await screen.findByText(/Your property is saved/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStart.mockResolvedValue({});
  mockSave.mockImplementation(async (_pid: string, ages: unknown) => ages);
  mockDomain.mockReturnValue("in.homegentic.app");
  mockAddress.mockResolvedValue("h-abc123@in.homegentic.app");
});

describe("AddPropertyModal — recently bought", () => {
  it("starts the move-in plan when the owner bought the home in the last year", async () => {
    await saveHome("Yes");
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith("p1"));
    expect(screen.getByText(/Move-in plan/i)).toBeInTheDocument();
  });

  it("doesn't start one when they say no or skip the question", async () => {
    await saveHome("No");
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("doesn't start one when the question is skipped", async () => {
    await saveHome();
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("AddPropertyModal — system ages", () => {
  it("saves original and replaced systems to the home record, skipping unanswered ones", async () => {
    await saveHome();
    fireEvent.click(screen.getByRole("button", { name: /Fill in ages/i }));
    expect(screen.queryByText(/pre-filled/i)).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "HVAC / AC" })).getByRole("radio", { name: /Replaced/i }),
    );
    fireEvent.change(screen.getByLabelText(/Year the HVAC \/ AC was replaced/i), { target: { value: "2019" } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Roof" })).getByRole("radio", { name: /Original/i }));

    fireEvent.click(screen.getByRole("button", { name: /Save & continue/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("p1", { HVAC: 2019, Roofing: 1990 }));
    expect(await screen.findByText(/Your property is saved/i)).toBeInTheDocument();
  });

  it("stays on the step when the record refuses the years", async () => {
    mockSave.mockRejectedValueOnce(new Error("The HVAC year is in the future"));
    await saveHome();
    fireEvent.click(screen.getByRole("button", { name: /Fill in ages/i }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Roof" })).getByRole("radio", { name: /Original/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save & continue/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(screen.getByText(/How old are your systems/i)).toBeInTheDocument();
  });
});

describe("AddPropertyModal — paperwork", () => {
  it("shows the invoice-forwarding address and points to the label scan", async () => {
    await saveHome();
    fireEvent.click(screen.getByRole("button", { name: /Set up capture/i }));
    fireEvent.click(screen.getByRole("button", { name: /Show my address/i }));
    expect(await screen.findByText("h-abc123@in.homegentic.app")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scan a label/i })).toBeInTheDocument();
  });

  it("leaves out the forwarding address when invoice forwarding isn't set up", async () => {
    mockDomain.mockReturnValue("");
    await saveHome();
    fireEvent.click(screen.getByRole("button", { name: /Set up capture/i }));
    expect(screen.queryByRole("button", { name: /Show my address/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scan a label/i })).toBeInTheDocument();
  });
});
