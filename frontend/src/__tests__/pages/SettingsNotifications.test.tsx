/**
 * SettingsPage — Notifications tab, both roles.
 *
 * The push, email and SMS rows are preferences kept by the notification
 * relay: they load from it, save each change to it, roll back when the save
 * fails, and are hidden when the relay (or that channel) isn't configured.
 * SMS only turns on after the user confirms a number with a texted code.
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { PLANS } from "@/services/planConstants";

const who = vi.hoisted(() => ({ role: "Contractor" }));

const relay = vi.hoisted(() => ({
  configured: true,
  getNotificationPrefs: vi.fn(),
  setNotificationPrefs: vi.fn(),
  startSmsVerification: vi.fn(),
  confirmSms:           vi.fn(),
  removeSmsPhone:       vi.fn(),
}));

vi.mock("@/services/notificationPrefs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notificationPrefs")>();
  return {
    toE164:                  actual.toE164,
    notificationsConfigured: () => relay.configured,
    getNotificationPrefs:    (...a: unknown[]) => relay.getNotificationPrefs(...a),
    setNotificationPrefs:    (...a: unknown[]) => relay.setNotificationPrefs(...a),
    startSmsVerification:    (...a: unknown[]) => relay.startSmsVerification(...a),
    confirmSms:              (...a: unknown[]) => relay.confirmSms(...a),
    removeSmsPhone:          (...a: unknown[]) => relay.removeSmsPhone(...a),
  };
});

vi.mock("@/services/pushNotifications", () => ({
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
    profile:         { name: "Test User", role: who.role, email: "user@example.com" },
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

type State = {
  prefs: {
    push:  Record<string, boolean>;
    email: Record<string, boolean>;
    sms:   { enabled: boolean; phone: string | null };
  };
  channels: { email: boolean; sms: boolean };
};

function makeState(over: { sms?: State["prefs"]["sms"]; email?: Record<string, boolean>; channels?: Partial<State["channels"]> } = {}): State {
  return {
    prefs: {
      push:  { job_awaiting_signature: true, job_awaiting_contractor_signature: true, bid_accepted: true, bid_declined: true },
      email: { new_lead: true, bid_outcome: false, job_verified: true, quote_received: true, job_updates: false, ...over.email },
      sms:   over.sms ?? { enabled: false, phone: null },
    },
    channels: { email: true, sms: true, ...over.channels },
  };
}

function renderNotificationsTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=notifications"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

const switchFor = (label: string) => screen.getByRole("switch", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  who.role = "Contractor";
  relay.configured = true;
  relay.getNotificationPrefs.mockResolvedValue(makeState());
});

describe("contractor push preferences", () => {
  it("shows the bid and signature rows once the preferences load", async () => {
    renderNotificationsTab();
    await waitFor(() => expect(screen.getByText("Push: Bid Accepted")).toBeInTheDocument());
    expect(screen.getByText("Push: Bid Not Selected")).toBeInTheDocument();
    expect(screen.getByText("Push: Job Pending Signature")).toBeInTheDocument();
  });

  it("saves a change to the relay", async () => {
    relay.setNotificationPrefs.mockResolvedValue(makeState());
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Not Selected"));
    fireEvent.click(switchFor("Push: Bid Not Selected"));
    await waitFor(() => expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ push: { bid_declined: false } }));
  });

  it("saves the job-signature preference under its own kind", async () => {
    relay.setNotificationPrefs.mockResolvedValue(makeState());
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Job Pending Signature"));
    fireEvent.click(switchFor("Push: Job Pending Signature"));
    await waitFor(() =>
      expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ push: { job_awaiting_contractor_signature: false } }),
    );
  });

  it("reports a failed save and rolls the switch back", async () => {
    relay.setNotificationPrefs.mockRejectedValue(new Error("Sign in again to change notifications"));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Accepted"));
    fireEvent.click(switchFor("Push: Bid Accepted"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sign in again to change notifications"));
    expect(switchFor("Push: Bid Accepted")).toHaveAttribute("aria-checked", "true");
  });

  it("hides the relay rows when no relay is configured", async () => {
    relay.configured = false;
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: New Lead in My Trades"));
    expect(screen.queryByText("Push: Bid Accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("Email: New Lead")).not.toBeInTheDocument();
    expect(screen.queryByText("SMS Alerts")).not.toBeInTheDocument();
    expect(relay.getNotificationPrefs).not.toHaveBeenCalled();
  });

  it("has no save button — every row saves as it changes", async () => {
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Accepted"));
    expect(screen.queryByRole("button", { name: "Save Preferences" })).not.toBeInTheDocument();
  });
});

describe("contractor email preferences", () => {
  it("shows the relay's values and saves changes", async () => {
    relay.setNotificationPrefs.mockResolvedValue(makeState({ email: { bid_outcome: true } }));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Email: Bid Outcome"));
    expect(switchFor("Email: New Lead")).toHaveAttribute("aria-checked", "true");
    expect(switchFor("Email: Bid Outcome")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(switchFor("Email: Bid Outcome"));
    await waitFor(() => expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ email: { bid_outcome: true } }));
    expect(switchFor("Email: Bid Outcome")).toHaveAttribute("aria-checked", "true");
  });

  it("hides email rows when the relay can't send email", async () => {
    relay.getNotificationPrefs.mockResolvedValue(makeState({ channels: { email: false } }));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Accepted"));
    expect(screen.queryByText("Email: New Lead")).not.toBeInTheDocument();
  });
});

describe("homeowner preferences", () => {
  beforeEach(() => { who.role = "Homeowner"; });

  it("saves each email row under its key", async () => {
    relay.setNotificationPrefs.mockResolvedValue(makeState());
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Email: Job Verified"));
    fireEvent.click(switchFor("Email: Job Verified"));
    fireEvent.click(switchFor("Email: Quote Received"));
    fireEvent.click(switchFor("Email: Job Updates"));
    await waitFor(() => expect(relay.setNotificationPrefs).toHaveBeenCalledTimes(3));
    expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ email: { job_verified: false } });
    expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ email: { quote_received: false } });
    expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ email: { job_updates: true } });
  });

  it("keeps the dashboard toggles in this browser, saved as they change", async () => {
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Weekly Home Pulse"));
    fireEvent.click(switchFor("Weekly Home Pulse"));
    expect(localStorage.getItem("homegentic_pulse_enabled")).toBe("false");
    expect(relay.setNotificationPrefs).not.toHaveBeenCalled();
  });

  it("shows no contractor rows", async () => {
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Email: Job Verified"));
    expect(screen.queryByText("Push: Bid Accepted")).not.toBeInTheDocument();
    expect(screen.queryByText("Email: New Lead")).not.toBeInTheDocument();
  });
});

describe("SMS alerts", () => {
  it.each(["Contractor", "Homeowner"])("confirms a number before turning on (%s)", async (role) => {
    who.role = role;
    relay.startSmsVerification.mockResolvedValue(undefined);
    relay.confirmSms.mockResolvedValue(makeState({ sms: { enabled: true, phone: "•••• 0142" } }));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("SMS Alerts"));

    fireEvent.click(switchFor("SMS Alerts"));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "(512) 555-0142" } });
    fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
    await waitFor(() => expect(relay.startSmsVerification).toHaveBeenCalledWith("+15125550142"));

    fireEvent.change(await screen.findByLabelText(/Code we texted/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(relay.confirmSms).toHaveBeenCalledWith("+15125550142", "123456"));
    await waitFor(() => expect(switchFor("SMS Alerts")).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText(/Texts go to •••• 0142/)).toBeInTheDocument();
    expect(relay.setNotificationPrefs).not.toHaveBeenCalled();
  });

  it("rejects a number it can't read without calling the relay", async () => {
    renderNotificationsTab();
    await waitFor(() => screen.getByText("SMS Alerts"));
    fireEvent.click(switchFor("SMS Alerts"));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "555-0142" } });
    fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/country code/);
    expect(relay.startSmsVerification).not.toHaveBeenCalled();
  });

  it("shows a wrong code and stays off", async () => {
    relay.startSmsVerification.mockResolvedValue(undefined);
    relay.confirmSms.mockRejectedValue(new Error("That code isn't right, or it has expired"));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("SMS Alerts"));
    fireEvent.click(switchFor("SMS Alerts"));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "5125550142" } });
    fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
    fireEvent.change(await screen.findByLabelText(/Code we texted/), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't right/);
    expect(screen.getByLabelText(/Code we texted/)).toBeInTheDocument();
  });

  it("with a confirmed number, the switch saves and the number can be removed", async () => {
    relay.getNotificationPrefs.mockResolvedValue(makeState({ sms: { enabled: true, phone: "•••• 0142" } }));
    relay.setNotificationPrefs.mockResolvedValue(makeState({ sms: { enabled: false, phone: "•••• 0142" } }));
    relay.removeSmsPhone.mockResolvedValue(makeState());
    renderNotificationsTab();
    await waitFor(() => screen.getByText(/Texts go to •••• 0142/));

    fireEvent.click(switchFor("SMS Alerts"));
    await waitFor(() => expect(relay.setNotificationPrefs).toHaveBeenCalledWith({ sms: { enabled: false } }));

    fireEvent.click(screen.getByRole("button", { name: "Remove this number" }));
    await waitFor(() => expect(relay.removeSmsPhone).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Texts go to/)).not.toBeInTheDocument());
  });

  it("is hidden when the relay can't send texts", async () => {
    relay.getNotificationPrefs.mockResolvedValue(makeState({ channels: { sms: false } }));
    renderNotificationsTab();
    await waitFor(() => screen.getByText("Push: Bid Accepted"));
    expect(screen.queryByText("SMS Alerts")).not.toBeInTheDocument();
  });
});
