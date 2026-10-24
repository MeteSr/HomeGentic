/**
 * SettingsPage — Privacy tab. Each switch loads from and saves to its
 * canister (report for homeowners, contractor for contractors) as it changes,
 * and rolls back with an error toast if the save fails.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { role, mockToastError, report, contractor } = vi.hoisted(() => ({
  role: { current: "Homeowner" },
  mockToastError: vi.fn(),
  report: {
    getAllowPublicReports: vi.fn(),
    setAllowPublicReports: vi.fn(),
  },
  contractor: {
    getMyProfile:        vi.fn(),
    getMyProfilePrivacy: vi.fn(),
    setProfilePrivacy:   vi.fn(),
  },
}));

vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return { ...actual, reportService: report };
});

vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return { ...actual, contractorService: contractor };
});

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
      getMySubscription: vi.fn(() => Promise.resolve({ tier: "Free", expiresAt: null })),
      getPauseState:     vi.fn().mockReturnValue(null),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    principal:       "test-principal",
    profile:         { name: "Test User", role: role.current, email: "test@example.com" },
    isLoading:       false,
    tier:            null,
    setTier:         vi.fn(),
    setProfile:      vi.fn(),
  })),
}));

vi.mock("@/store/propertyStore", () => ({ usePropertyStore: vi.fn(() => ({ properties: [] })) }));
vi.mock("@/store/jobStore",      () => ({ useJobStore:      vi.fn(() => ({ jobs: [] })) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: mockToastError } }));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/DeleteAccountSection", () => ({ DeleteAccountSection: () => null }));

import SettingsPage from "@/pages/SettingsPage";
import { DEFAULT_PROFILE_PRIVACY } from "@/services/contractor";

function renderPrivacyTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=privacy"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

const sw = (name: string) => screen.getByRole("switch", { name });

beforeEach(() => {
  vi.clearAllMocks();
  role.current = "Homeowner";
});

describe("Privacy tab — homeowner", () => {
  it("shows the saved setting once it loads", async () => {
    report.getAllowPublicReports.mockResolvedValue(false);
    renderPrivacyTab();
    await waitFor(() => expect(sw("Public HomeGentic Report")).toBeEnabled());
    expect(sw("Public HomeGentic Report")).toHaveAttribute("aria-checked", "false");
  });

  it("saves a change straight away", async () => {
    report.getAllowPublicReports.mockResolvedValue(true);
    report.setAllowPublicReports.mockResolvedValue(undefined);
    renderPrivacyTab();
    await waitFor(() => expect(sw("Public HomeGentic Report")).toBeEnabled());
    fireEvent.click(sw("Public HomeGentic Report"));
    expect(report.setAllowPublicReports).toHaveBeenCalledWith(false);
    expect(sw("Public HomeGentic Report")).toHaveAttribute("aria-checked", "false");
  });

  it("rolls back and says so when the save fails", async () => {
    report.getAllowPublicReports.mockResolvedValue(true);
    report.setAllowPublicReports.mockRejectedValue(new Error("Paused"));
    renderPrivacyTab();
    await waitFor(() => expect(sw("Public HomeGentic Report")).toBeEnabled());
    fireEvent.click(sw("Public HomeGentic Report"));
    await waitFor(() => expect(sw("Public HomeGentic Report")).toHaveAttribute("aria-checked", "true"));
    expect(mockToastError).toHaveBeenCalledWith("Paused");
  });

  it("keeps the switch disabled when the setting can't be loaded", async () => {
    report.getAllowPublicReports.mockRejectedValue(new Error("offline"));
    renderPrivacyTab();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load your privacy settings/i));
    expect(sw("Public HomeGentic Report")).toBeDisabled();
  });

  it("has no switches for things HomeGentic doesn't do", async () => {
    report.getAllowPublicReports.mockResolvedValue(true);
    renderPrivacyTab();
    await waitFor(() => expect(sw("Public HomeGentic Report")).toBeEnabled());
    expect(screen.queryByRole("switch", { name: "Share Analytics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Contractor Visibility" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save privacy settings/i })).not.toBeInTheDocument();
  });
});

describe("Privacy tab — contractor", () => {
  beforeEach(() => {
    role.current = "Contractor";
    contractor.getMyProfile.mockResolvedValue(null);
  });

  it("loads the saved settings", async () => {
    contractor.getMyProfilePrivacy.mockResolvedValue({ listed: false, showTrustScore: true, showJobsCompleted: false });
    renderPrivacyTab();
    await waitFor(() => expect(sw("Listed in the Directory")).toBeEnabled());
    expect(sw("Listed in the Directory")).toHaveAttribute("aria-checked", "false");
    expect(sw("Show Trust Score")).toHaveAttribute("aria-checked", "true");
    expect(sw("Show Jobs Completed")).toHaveAttribute("aria-checked", "false");
  });

  it("saves the whole set with the one change", async () => {
    contractor.getMyProfilePrivacy.mockResolvedValue(DEFAULT_PROFILE_PRIVACY);
    contractor.setProfilePrivacy.mockImplementation(async (p) => p);
    renderPrivacyTab();
    await waitFor(() => expect(sw("Show Trust Score")).toBeEnabled());
    fireEvent.click(sw("Show Trust Score"));
    expect(contractor.setProfilePrivacy).toHaveBeenCalledWith({ listed: true, showTrustScore: false, showJobsCompleted: true });
  });

  it("rolls back when the save fails", async () => {
    contractor.getMyProfilePrivacy.mockResolvedValue(DEFAULT_PROFILE_PRIVACY);
    contractor.setProfilePrivacy.mockRejectedValue(new Error("Create your contractor profile first"));
    renderPrivacyTab();
    await waitFor(() => expect(sw("Listed in the Directory")).toBeEnabled());
    fireEvent.click(sw("Listed in the Directory"));
    await waitFor(() => expect(sw("Listed in the Directory")).toHaveAttribute("aria-checked", "true"));
    expect(mockToastError).toHaveBeenCalledWith("Create your contractor profile first");
  });
});
