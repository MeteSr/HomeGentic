/**
 * ContractorProfilePage — real logic worth locking down:
 *   - new vs existing profile: register() vs updateProfile(), header/button text
 *   - validation order: name -> email required -> email format -> phone
 *     required -> phone format -> at least one trade
 *   - optional fields (bio/license/serviceArea) become null, not "", when blank
 *   - trade toggling adds/removes from specialties
 *   - service-zip commit: only accepts 5-digit codes, dedupes, caps at 50, and
 *     can be removed again
 *   - verified badge only for existing verified contractors
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ContractorProfilePage from "@/pages/ContractorProfilePage";
import type { ContractorProfile } from "@/services/contractor";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetMyProfile, mockUpdateProfile, mockRegister } = vi.hoisted(() => ({
  mockGetMyProfile:  vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockRegister:      vi.fn(),
}));

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return {
    ...actual,
    contractorService: {
      getMyProfile: mockGetMyProfile,
      updateProfile: mockUpdateProfile,
      register: mockRegister,
    },
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError:   vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: mockToastError, success: mockToastSuccess },
}));

function makeProfile(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: "ctr-1", name: "Alice Anderson", specialties: ["HVAC"],
    email: "alice@example.com", phone: "512-555-0100", bio: null, licenseNumber: null,
    serviceArea: null, serviceZips: [], trustScore: 80, jobsCompleted: 3,
    isVerified: false, createdAt: Date.now(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ContractorProfilePage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ContractorProfilePage — new profile", () => {
  beforeEach(() => mockGetMyProfile.mockResolvedValue(null));

  it("shows the setup header and Create Profile button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Set Up Your Profile")).toBeInTheDocument());
    expect(screen.getByText("Create Profile")).toBeInTheDocument();
  });

  it("validates required fields in order: name, email, phone, trades", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Create Profile")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Name is required");

    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Bob's Plumbing" } });
    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Email is required");

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Enter a valid email address");

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "bob@example.com" } });
    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Phone is required");

    fireEvent.change(screen.getByPlaceholderText("(512) 555-0100"), { target: { value: "abc" } });
    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Enter a valid phone number");

    fireEvent.change(screen.getByPlaceholderText("(512) 555-0100"), { target: { value: "512-555-0100" } });
    fireEvent.click(screen.getByText("Create Profile"));
    expect(mockToastError).toHaveBeenLastCalledWith("Select at least one trade");

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("registers a new profile and redirects to the contractor dashboard", async () => {
    mockRegister.mockResolvedValue(makeProfile());
    renderPage();
    await waitFor(() => expect(screen.getByText("Create Profile")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Bob's Plumbing" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "bob@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("(512) 555-0100"), { target: { value: "512-555-0100" } });
    fireEvent.click(screen.getByText("Plumbing"));
    fireEvent.click(screen.getByText("Create Profile"));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({
      name: "Bob's Plumbing",
      specialties: ["Plumbing"],
      email: "bob@example.com",
      phone: "512-555-0100",
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith("Contractor profile created!");
    expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard");
  });

  it("toggles a trade on and back off", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Create Profile")).toBeInTheDocument());

    const hvacButton = screen.getByText("HVAC");
    fireEvent.click(hvacButton); // select
    fireEvent.click(hvacButton); // deselect

    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "x@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("(512) 555-0100"), { target: { value: "5125550100" } });
    fireEvent.click(screen.getByText("Create Profile"));

    expect(mockToastError).toHaveBeenLastCalledWith("Select at least one trade");
  });

  it("only accepts 5-digit zip codes and dedupes on commit", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Create Profile")).toBeInTheDocument());

    const zipInput = screen.getByPlaceholderText("e.g. 78701 — press Enter to add");

    fireEvent.change(zipInput, { target: { value: "123" } });
    fireEvent.keyDown(zipInput, { key: "Enter" });
    expect(screen.queryByLabelText("Remove 123")).not.toBeInTheDocument();

    fireEvent.change(zipInput, { target: { value: "78701" } });
    fireEvent.keyDown(zipInput, { key: "Enter" });
    expect(screen.getByLabelText("Remove 78701")).toBeInTheDocument();

    // duplicate is ignored
    fireEvent.change(zipInput, { target: { value: "78701" } });
    fireEvent.keyDown(zipInput, { key: "Enter" });
    expect(screen.getAllByLabelText("Remove 78701")).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Remove 78701"));
    expect(screen.queryByLabelText("Remove 78701")).not.toBeInTheDocument();
  });
});

describe("ContractorProfilePage — existing profile", () => {
  it("shows the edit header, Save Changes button, and verified badge", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: true }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Edit Profile")).toBeInTheDocument());
    expect(screen.getByText("Save Changes")).toBeInTheDocument();
    expect(screen.getByText("Verified contractor")).toBeInTheDocument();
  });

  it("does not show the verified badge for an unverified existing profile", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ isVerified: false }));
    renderPage();

    await waitFor(() => expect(screen.getByText("Edit Profile")).toBeInTheDocument());
    expect(screen.queryByText("Verified contractor")).not.toBeInTheDocument();
  });

  it("shows singular job wording for exactly one completed job", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ jobsCompleted: 1 }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/1 job completed\./)).toBeInTheDocument());
  });

  it("sends null (not empty strings) for blank optional fields on update", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({ bio: "Existing bio text that is already long enough to pass forty chars." , licenseNumber: "LIC-1", serviceArea: "Austin" }));
    mockUpdateProfile.mockResolvedValue(makeProfile());
    renderPage();
    await waitFor(() => expect(screen.getByText("Save Changes")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Describe your experience, certifications, and what sets you apart. Homeowners read this before accepting a quote."), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. TX-HVAC-12345"), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Austin, TX (50 mi)"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ bio: null, licenseNumber: null, serviceArea: null })
    ));
    expect(mockToastSuccess).toHaveBeenCalledWith("Profile updated.");
    expect(mockNavigate).toHaveBeenCalledWith("/contractor-dashboard");
  });
});

describe("ContractorProfilePage — profile completeness", () => {
  it("shows 100% when every check passes", async () => {
    mockGetMyProfile.mockResolvedValue(makeProfile({
      bio: "A".repeat(40),
      licenseNumber: "LIC-1",
      serviceArea: "Austin, TX",
    }));
    renderPage();

    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
    expect(screen.queryByText(/Complete profiles receive/)).not.toBeInTheDocument();
  });

  it("shows a partial percentage and the completeness nudge when fields are missing", async () => {
    mockGetMyProfile.mockResolvedValue(null);
    renderPage();

    await waitFor(() => expect(screen.getByText("0%")).toBeInTheDocument());
    expect(screen.getByText(/Complete profiles receive 20% more bid views/)).toBeInTheDocument();
  });
});
