/**
 * SettingsPage — Notifications tab, Contractor role.
 *
 * The bid and signature push rows are real preferences kept by the
 * notification relay: they load from it, save each change to it, roll back
 * when the save fails, and are hidden when no relay is configured.
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { PLANS } from "@/services/planConstants";

const push = vi.hoisted(() => ({
  configured: true,
  getPushPrefs: vi.fn(),
  setPushPrefs: vi.fn(),
}));

vi.mock("@/services/pushNotifications", () => ({
  pushConfigured: () => push.configured,
  getPushPrefs:   (...a: unknown[]) => push.getPushPrefs(...a),
  setPushPrefs:   (...a: unknown[]) => push.setPushPrefs(...a),
  getPushStatus:  vi.fn().mockResolvedValue("unavailable"),
  enablePush:     vi.fn(),
  disablePush:    vi.fn(),
}));

vi.mock("@/services/contractor", () => ({
  contractorService: {
    getMyProfile:      vi.fn().mockResolvedValue({ notifyPush: true }),
    setLeadPushAlerts: vi.fn(),
  },
}));

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
      getMySubscription: vi.fn(),
      initiate:          vi.fn().mockResolvedValue({ url: "/dashboard" }),
      cancel:            vi.fn().mockResolvedValue({ expiresAt: null }),
      recordCancellation: vi.fn(),
      pause:             vi.fn(),
      resume:            vi.fn(),
      getPauseState:     vi.fn().mockReturnValue(null),
      getPlan:           vi.fn((tier) => PLANS.find((p) => p.tier === tier) ?? PLANS[0]),
    },
  };
});

vi.mock("@/services/job", () => ({
  jobService: { getMyReferralJobs: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/auth", () => ({
  authService: { updateProfile: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/services/winBackService", () => ({
  winBackService: { schedule: vi.fn() },
}));

vi.mock("@/services/agentProfile", () => ({
  agentProfileService: { getMyProfile: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    principal:       "test-contractor-principal",
    profile:         { name: "Test Contractor", role: "Contractor", email: "contractor@example.com" },
    isLoading:       false,
    tier:            null,
    setTier:         vi.fn(),
    setProfile:      vi.fn(),
  })),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: vi.fn(() => ({ properties: [] })),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: vi.fn(() => ({ jobs: [] })),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

import SettingsPage from "@/pages/SettingsPage";
import toast from "react-hot-toast";

const PREFS = {
  job_awaiting_signature:            true,
  job_awaiting_contractor_signature: true,
  bid_accepted:                      true,
  bid_declined:                      true,
};

function renderNotificationsTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

/** The switch next to a ToggleRow's label. */
function switchFor(label: string): HTMLElement {
  return screen.getByText(label).parentElement!.nextElementSibling as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  push.configured = true;
  push.getPushPrefs.mockResolvedValue(PREFS);
});

describe("SettingsPage — contractor push preferences", () => {
  it("shows the bid and signature rows once the preferences load", async () => {
    renderNotificationsTab();
    await waitFor(() => expect(screen.getByText("Push: Bid Accepted")).toBeInTheDocument());
    expect(screen.getByText("Push: Bid Not Selected")).toBeInTheDocument();
    expect(screen.getByText("Push: Job Pending Signature")).toBeInTheDocument();
  });

  it("saves a change to the relay", async () => {
    push.setPushPrefs.mockResolvedValue({ ...PREFS, bid_declined: false });
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Not Selected"));
    fireEvent.click(switchFor("Push: Bid Not Selected"));
    await waitFor(() => expect(push.setPushPrefs).toHaveBeenCalledWith({ bid_declined: false }));
  });

  it("saves the job-signature preference under its own kind", async () => {
    push.setPushPrefs.mockResolvedValue({ ...PREFS, job_awaiting_contractor_signature: false });
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Job Pending Signature"));
    fireEvent.click(switchFor("Push: Job Pending Signature"));
    await waitFor(() =>
      expect(push.setPushPrefs).toHaveBeenCalledWith({ job_awaiting_contractor_signature: false }),
    );
  });

  it("reports a failed save", async () => {
    push.setPushPrefs.mockRejectedValue(new Error("Sign in again to change notifications"));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Accepted"));
    fireEvent.click(switchFor("Push: Bid Accepted"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sign in again to change notifications"));
  });

  it("hides the rows when no relay is configured", async () => {
    push.configured = false;
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: New Lead in My Trades"));
    expect(screen.queryByText("Push: Bid Accepted")).not.toBeInTheDocument();
    expect(push.getPushPrefs).not.toHaveBeenCalled();
  });
});
