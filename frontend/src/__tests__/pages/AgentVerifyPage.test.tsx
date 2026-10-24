/**
 * AgentVerifyPage — real logic worth locking down:
 *   - registration form transforms the comma-separated cities into a
 *     trimmed, lowercased, filtered array before calling agentService.register
 *   - step-card "passed" states derive from isVerified (admin review) and cardOnFile
 *   - accepting fee terms records it and navigates to the listings feed
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
  it("leaves every step in progress until HomeGentic reviews the agent and fee terms are accepted", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: false, cardOnFile: false }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("IN PROGRESS").length).toBe(3));
    expect(screen.queryByText("PASSED")).not.toBeInTheDocument();
    expect(screen.getByText("Selection fee")).toBeInTheDocument();
    expect(screen.getByText("Accept fee terms and see listings")).toBeInTheDocument();
  });

  it("marks licence and brokerage passed once the admin review sets isVerified", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: true, cardOnFile: false }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("PASSED").length).toBe(2));
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByText("Accept fee terms and see listings")).toBeInTheDocument();
  });

  it("shows Awaiting review after fee terms are accepted but before admin review", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: false, cardOnFile: true }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Awaiting review")).toBeInTheDocument());
    expect(screen.getAllByText("PASSED").length).toBe(1);
    expect(screen.getByText("Browse listings →")).toBeInTheDocument();
  });

  it("shows all steps passed and Verified once reviewed and fee terms accepted", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: true, cardOnFile: true }));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("PASSED").length).toBe(3));
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Browse listings →")).toBeInTheDocument();
  });
});

describe("AgentVerifyPage — accept fee terms", () => {
  it("records fee-terms acceptance and navigates to the listings feed", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ cardOnFile: false }));
    mockSetCardOnFile.mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => expect(screen.getByText("Accept fee terms and see listings")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Accept fee terms and see listings"));

    await waitFor(() => expect(mockSetCardOnFile).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/agents/browse"));
  });

  it("shows an error toast when accepting fee terms fails", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ cardOnFile: false }));
    mockSetCardOnFile.mockRejectedValue(new Error("Network down"));
    renderPage();

    await waitFor(() => expect(screen.getByText("Accept fee terms and see listings")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Accept fee terms and see listings"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Network down"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
