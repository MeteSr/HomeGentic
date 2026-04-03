/**
 * TDD — Epic 8.3: Cancellation UX
 *
 *   8.3.2 — Post-cancel read-only mode:
 *     - paymentService records cancelledAt in localStorage
 *     - SettingsPage "done" state shows read-only mode notice
 *     - Score and report sections show static / read-only messaging
 *
 *   8.3.5 — Win-back notification sequence:
 *     - winBackService schedules 7 / 30 / 90-day messages on cancel
 *     - getPendingMessage() returns the right message when due
 *     - Messages say "Your home didn't stop aging" (or similar)
 *     - SettingsPage cancel handler calls winBackService.schedule()
 */

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Mock tier (mutable per test) ────────────────────────────────────────────

let mockTier = "Pro";

vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return {
    ...actual,
    paymentService: {
      ...actual.paymentService,
      getMySubscription: vi.fn().mockImplementation(() =>
        Promise.resolve({ tier: mockTier, expiresAt: null })
      ),
      cancel: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      initiate: vi.fn().mockResolvedValue({ url: "/dashboard" }),
      getPauseState: vi.fn().mockReturnValue(null),
      getCancellationInfo: vi.fn().mockReturnValue(null),
      recordCancellation: vi.fn(),
      reset: vi.fn(),
    },
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: () => ({ principal: "test", profile: { role: "Homeowner" }, isAuthenticated: true }),
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: [] }),
}));

vi.mock("@/store/jobStore", () => ({
  useJobStore: () => ({ jobs: [] }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock("@/components/VoiceAgent", () => ({ VoiceAgent: () => null }));

vi.mock("@/services/job", () => ({
  jobService: { getAll: vi.fn().mockResolvedValue([]), getByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import SettingsPage from "@/pages/SettingsPage";
import { paymentService } from "@/services/payment";

// ─── Render helper ────────────────────────────────────────────────────────────

async function renderSettings() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsPage />
      </MemoryRouter>
    );
  });
  return result!;
}

async function navigateToSubscriptionTab() {
  await act(async () => {
    const btn = screen.queryByRole("button", { name: /subscription/i })
      ?? screen.queryByText(/subscription/i);
    if (btn) fireEvent.click(btn);
  });
}

async function triggerCancel() {
  // Wait for subscription tab to load tier (useEffect async)
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /cancel.*plan|cancel subscription/i })).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: /cancel.*plan|cancel subscription/i }));
  // Click confirm
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /confirm cancellation/i })).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole("button", { name: /confirm cancellation/i }));
}

// ─── 8.3.2 — Post-cancel read-only mode ──────────────────────────────────────

describe("paymentService — cancellation info (8.3.2)", () => {
  let realPaymentService: typeof import("@/services/payment")["paymentService"];

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import("@/services/payment")>("@/services/payment");
    realPaymentService = mod.paymentService;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("getCancellationInfo returns null before any cancellation", () => {
    expect(realPaymentService.getCancellationInfo()).toBeNull();
  });

  it("recordCancellation stores a timestamp in localStorage", () => {
    const before = Date.now();
    realPaymentService.recordCancellation();
    const info = realPaymentService.getCancellationInfo();
    expect(info).not.toBeNull();
    expect(info!.cancelledAt).toBeGreaterThanOrEqual(before);
    expect(info!.cancelledAt).toBeLessThanOrEqual(Date.now());
  });

  it("getCancellationInfo returns the stored timestamp on subsequent calls", () => {
    realPaymentService.recordCancellation();
    const first  = realPaymentService.getCancellationInfo();
    const second = realPaymentService.getCancellationInfo();
    expect(first!.cancelledAt).toBe(second!.cancelledAt);
  });
});

describe("SettingsPage — post-cancel read-only notice (8.3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTier = "Pro";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro" as any, expiresAt: null });
    vi.mocked(paymentService.cancel).mockResolvedValue(undefined);
    vi.mocked(paymentService.getCancellationInfo).mockReturnValue(null);
  });

  it("shows read-only mode notice after cancellation is complete", async () => {
    await renderSettings();
    await navigateToSubscriptionTab();
    await triggerCancel();
    await waitFor(() =>
      expect(screen.getAllByText(/read.?only/i).length).toBeGreaterThan(0)
    );
  });

  it("post-cancel notice mentions that score won't update", async () => {
    await renderSettings();
    await navigateToSubscriptionTab();
    await triggerCancel();
    await waitFor(() =>
      expect(screen.getByText(/score.*won't.*update|score.*no longer.*update/i)).toBeInTheDocument()
    );
  });

  it("post-cancel notice mentions reports are static", async () => {
    await renderSettings();
    await navigateToSubscriptionTab();
    await triggerCancel();
    await waitFor(() =>
      expect(screen.getByText(/reports.*static|existing.*reports/i)).toBeInTheDocument()
    );
  });

  it("calls paymentService.recordCancellation() after successful cancel", async () => {
    await renderSettings();
    await navigateToSubscriptionTab();
    await triggerCancel();
    await waitFor(() =>
      expect(vi.mocked(paymentService.recordCancellation)).toHaveBeenCalled()
    );
  });
});

// ─── 8.3.5 — Win-back notification sequence ──────────────────────────────────

describe("winBackService — scheduling and messages (8.3.5)", () => {
  let winBackService: typeof import("@/services/winBackService")["winBackService"];

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import("@/services/winBackService")>("@/services/winBackService");
    winBackService = mod.winBackService;
    winBackService.__reset();
  });

  afterEach(() => {
    winBackService.__reset();
  });

  it("getPendingMessage returns null when nothing is scheduled", () => {
    expect(winBackService.getPendingMessage()).toBeNull();
  });

  it("getPendingMessage returns null when < 7 days have passed", () => {
    const cancelledAt = Date.now() - 3 * 86_400_000;   // 3 days ago
    winBackService.schedule(cancelledAt);
    expect(winBackService.getPendingMessage()).toBeNull();
  });

  it("getPendingMessage returns 7-day message when ≥ 7 days have passed", () => {
    const cancelledAt = Date.now() - 8 * 86_400_000;   // 8 days ago
    winBackService.schedule(cancelledAt);
    const msg = winBackService.getPendingMessage();
    expect(msg).not.toBeNull();
    expect(msg!.days).toBe(7);
  });

  it("7-day message mentions 'Your home didn't stop aging'", () => {
    const cancelledAt = Date.now() - 8 * 86_400_000;
    winBackService.schedule(cancelledAt);
    const msg = winBackService.getPendingMessage();
    expect(msg!.text).toMatch(/your home didn't stop aging|home.*didn't stop aging/i);
  });

  it("returns 30-day message (not 7-day) when 7-day is already sent", () => {
    const cancelledAt = Date.now() - 32 * 86_400_000;  // 32 days ago
    winBackService.schedule(cancelledAt);
    winBackService.markSent(7);
    const msg = winBackService.getPendingMessage();
    expect(msg).not.toBeNull();
    expect(msg!.days).toBe(30);
  });

  it("returns 90-day message when both 7 and 30-day are sent", () => {
    const cancelledAt = Date.now() - 95 * 86_400_000;  // 95 days ago
    winBackService.schedule(cancelledAt);
    winBackService.markSent(7);
    winBackService.markSent(30);
    const msg = winBackService.getPendingMessage();
    expect(msg).not.toBeNull();
    expect(msg!.days).toBe(90);
  });

  it("returns null when all three windows are sent", () => {
    const cancelledAt = Date.now() - 95 * 86_400_000;
    winBackService.schedule(cancelledAt);
    winBackService.markSent(7);
    winBackService.markSent(30);
    winBackService.markSent(90);
    expect(winBackService.getPendingMessage()).toBeNull();
  });

  it("30-day message mentions new records or maintenance events", () => {
    const cancelledAt = Date.now() - 32 * 86_400_000;
    winBackService.schedule(cancelledAt);
    winBackService.markSent(7);
    const msg = winBackService.getPendingMessage();
    expect(msg!.text).toMatch(/maintenance|records|home.*aging|aging/i);
  });
});

describe("SettingsPage — triggers win-back schedule on cancel (8.3.5)", () => {
  let winBackService: typeof import("@/services/winBackService")["winBackService"];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTier = "Pro";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro" as any, expiresAt: null });
    vi.mocked(paymentService.cancel).mockResolvedValue(undefined);
    vi.mocked(paymentService.getCancellationInfo).mockReturnValue(null);
    const mod = await vi.importActual<typeof import("@/services/winBackService")>("@/services/winBackService");
    winBackService = mod.winBackService;
    winBackService.__reset();
  });

  afterEach(() => {
    winBackService.__reset();
  });

  it("schedules win-back after successful cancellation", async () => {
    const spy = vi.spyOn(winBackService, "schedule");
    await renderSettings();
    await navigateToSubscriptionTab();
    await triggerCancel();
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.any(Number))
    );
  });
});
