/**
 * AgentVerifyPage — real logic worth locking down:
 *   - registration form transforms the comma-separated cities into a
 *     trimmed, lowercased, filtered array before calling agentService.register
 *   - step-card "passed" states derive from real profile fields
 *   - finish-setup marks the card on file and navigates to the listings feed
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentVerifyPage from "@/pages/AgentVerifyPage";
import type { AgentProfile } from "@/services/agent";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetMyProfile, mockRegister, mockSetCardOnFile } = vi.hoisted(() => ({
  mockGetMyProfile:   vi.fn(),
  mockRegister:       vi.fn(),
  mockSetCardOnFile:  vi.fn(),
}));

vi.mock("@/services/agent", () => ({
  agentService: { getMyProfile: mockGetMyProfile, register: mockRegister, setCardOnFile: mockSetCardOnFile },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "agent-1", name: "Jane Realtor", brokerage: "ABC Realty",
    licenseNumber: "FL12345", licenseState: "FL", county: "Travis",
    serviceCities: ["austin"], bio: "", phone: "", email: "jane@example.com",
    avgDaysOnMarket: 0, listingsLast12Months: 0, isVerified: false,
    cardOnFile: false, createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  } as AgentProfile;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentVerifyPage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AgentVerifyPage — registration form", () => {
  it("splits, trims, lowercases and filters service cities before submitting", async () => {
    mockGetMyProfile.mockResolvedValue(null);
    mockRegister.mockResolvedValue(makeProfile());
    renderPage();

    await waitFor(() => expect(screen.getByText("Save details")).toBeInTheDocument());

    // Fields are plain labeled inputs without htmlFor/id, so query by DOM order.
    const inputs = document.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "Jane Realtor" } }); // name
    fireEvent.change(inputs[1], { target: { value: "ABC Realty" } });   // brokerage
    fireEvent.change(inputs[2], { target: { value: "FL12345" } });      // license number
    fireEvent.change(inputs[3], { target: { value: "FL" } });           // license state
    fireEvent.change(inputs[4], { target: { value: "Travis" } });       // county
    fireEvent.change(inputs[5], { target: { value: " Austin , , Round Rock ,AUSTIN" } }); // service cities
    fireEvent.change(inputs[7], { target: { value: "jane@example.com" } }); // email (inputs[6] is phone)

    fireEvent.click(screen.getByText("Save details"));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCities: ["austin", "round rock", "austin"],
      })
    ));
  });
});

describe("AgentVerifyPage — verification steps", () => {
  it("marks license and brokerage steps passed but card step in-progress", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ licenseNumber: "FL999", brokerage: "XYZ Realty", cardOnFile: false }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("PASSED").length).toBe(2));
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByText("Finish and see listings")).toBeInTheDocument();
  });

  it("shows all steps passed and a Browse listings link once the card is on file", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ cardOnFile: true }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("PASSED").length).toBe(3));
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Browse listings →")).toBeInTheDocument();
  });
});

describe("AgentVerifyPage — finish setup", () => {
  it("marks the card on file and navigates to the listings feed", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ cardOnFile: false }));
    mockSetCardOnFile.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByText("Finish and see listings")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Finish and see listings"));

    await waitFor(() => expect(mockSetCardOnFile).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/agents/browse"));
  });

  it("shows an error toast when finishing setup fails", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ cardOnFile: false }));
    mockSetCardOnFile.mockRejectedValue(new Error("Card declined"));
    renderPage();

    await waitFor(() => expect(screen.getByText("Finish and see listings")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Finish and see listings"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Card declined"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
