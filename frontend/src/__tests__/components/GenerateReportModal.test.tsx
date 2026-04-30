/**
 * TDD — 15.7.3: in-app notification on free-user report generation
 *
 * When a free user's generateReport() succeeds, notificationService.create()
 * must be called with type "ReportExpiry" and the 7-day upgrade message.
 * Pro+ users must NOT trigger the notification.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ─── Hoisted mock data (available before vi.mock factories run) ───────────────

const { mockShareLink } = vi.hoisted(() => ({
  mockShareLink: {
    token: "tok-123", snapshotId: "snap-1", propertyId: "42",
    createdBy: "owner", expiresAt: Date.now() + 7 * 86_400_000,
    visibility: "Public" as const, viewCount: 0, isActive: true, createdAt: Date.now(),
  },
}));

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProperty = {
  id: BigInt(42), address: "123 Maple St", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as const,
  yearBuilt: BigInt(1998), squareFeet: BigInt(2100),
  verificationLevel: "Basic" as const, tier: "Pro" as const,
  owner: "owner", isActive: true, createdAt: BigInt(0), updatedAt: BigInt(0),
};

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock("@/services/report", () => ({
  reportService: {
    listShareLinks:  vi.fn().mockResolvedValue([]),
    generateReport:  vi.fn().mockResolvedValue(mockShareLink),
    shareUrl:        vi.fn().mockReturnValue("https://example.com/report/tok-123"),
    revokeShareLink: vi.fn().mockResolvedValue(undefined),
    expiryLabel:     vi.fn().mockReturnValue("Expires in 7 days"),
  },
  propertyToInput: vi.fn().mockReturnValue({}),
  jobToInput:      vi.fn().mockReturnValue({}),
  roomToInput:     vi.fn().mockReturnValue({}),
}));

vi.mock("@/services/job", () => ({
  jobService: { getByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/recurringService", () => ({
  recurringService: {
    getByProperty: vi.fn().mockResolvedValue([]),
    getVisitLogs:  vi.fn().mockResolvedValue([]),
    toSummary:     vi.fn().mockReturnValue({}),
  },
}));

vi.mock("@/services/room", () => ({
  roomService: { getRoomsByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/scoreService", () => ({
  computeScore:  vi.fn().mockReturnValue(72),
  getScoreGrade: vi.fn().mockReturnValue("B"),
}));

vi.mock("@/services/agentProfile", () => ({
  agentProfileService: { load: vi.fn().mockReturnValue(null) },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// paymentService mock is set per-test
let mockTier: "Free" | "Basic" | "Pro" | "Premium" | "ContractorPro" = "Basic";
vi.mock("@/services/payment", () => ({
  paymentService: {
    getMyAgentCredits: vi.fn(() => Promise.resolve(0)),
    getMySubscription: vi.fn().mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    ),
  },
}));

// notificationService mock — we spy on create()
vi.mock("@/services/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications")>();
  return {
    ...actual,
    notificationService: {
      create:  vi.fn(),
      getAll:  vi.fn().mockReturnValue([]),
      __reset: vi.fn(),
    },
  };
});

import { GenerateReportModal } from "@/components/GenerateReportModal";
import { notificationService } from "@/services/notifications";
import { paymentService } from "@/services/payment";

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderModal() {
  return render(
    <MemoryRouter>
      <GenerateReportModal property={mockProperty} onClose={vi.fn()} />
    </MemoryRouter>
  );
}

async function clickGenerate() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /generate report link/i })).not.toBeDisabled()
  );
  fireEvent.click(screen.getByRole("button", { name: /generate report link/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Free-tier homeowners are blocked at the route level (PaidHomeownerRoute →
// /pricing), so the ReportExpiry notification path was removed entirely.
// These tests verify notificationService.create is never called regardless of tier.
describe("GenerateReportModal — report generation never fires in-app notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTier = "Basic";
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier, expiresAt: null, cancelledAt: null })
    );
  });

  it("does NOT call notificationService.create for Basic users", async () => {
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    expect(vi.mocked(notificationService.create)).not.toHaveBeenCalled();
  });

  it("does NOT call notificationService.create for Pro users", async () => {
    mockTier = "Pro";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro", expiresAt: null, cancelledAt: null });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    expect(vi.mocked(notificationService.create)).not.toHaveBeenCalled();
  });

  it("does NOT call notificationService.create for Premium users", async () => {
    mockTier = "Premium";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Premium", expiresAt: null, cancelledAt: null });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    expect(vi.mocked(notificationService.create)).not.toHaveBeenCalled();
  });

  it("does NOT call notificationService.create when generateReport throws", async () => {
    const { reportService } = await import("@/services/report");
    vi.mocked(reportService.generateReport).mockRejectedValueOnce(new Error("fail"));
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(vi.mocked(notificationService.create)).not.toHaveBeenCalled()
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// notificationService unit tests (use vi.importActual to bypass the mock)
// ──────────────────────────────────────────────────────────────name──────────

type NotifService = typeof import("@/services/notifications")["notificationService"];
let realNotificationService: NotifService;

beforeAll(async () => {
  const mod = await vi.importActual<typeof import("@/services/notifications")>("@/services/notifications");
  realNotificationService = mod.notificationService;
});

describe("notificationService — (15.7.3)", () => {
  beforeEach(() => {
    realNotificationService.__reset();
  });

  it("getAll returns empty array initially", () => {
    expect(realNotificationService.getAll()).toEqual([]);
  });

  it("create stores a notification and returns it", () => {
    const n = realNotificationService.create({
      type: "ReportExpiry",
      message: "Your HomeGentic report expires in 7 days — upgrade to Pro for a permanent link.",
      propertyId: "42",
    });
    expect(n.type).toBe("ReportExpiry");
    expect(n.propertyId).toBe("42");
    expect(typeof n.id).toBe("string");
    expect(typeof n.createdAt).toBe("number");
  });

  it("getAll returns all created notifications", () => {
    realNotificationService.create({ type: "ReportExpiry", message: "msg1", propertyId: "1" });
    realNotificationService.create({ type: "ReportExpiry", message: "msg2", propertyId: "2" });
    expect(realNotificationService.getAll()).toHaveLength(2);
  });

  it("getAll returns a copy — mutations don't affect internal state", () => {
    realNotificationService.create({ type: "ReportExpiry", message: "m", propertyId: "1" });
    const first = realNotificationService.getAll();
    first.push({ id: "x", type: "ReportExpiry", message: "injected", propertyId: "z", createdAt: 0 });
    expect(realNotificationService.getAll()).toHaveLength(1);
  });

  it("__reset clears all notifications", () => {
    realNotificationService.create({ type: "ReportExpiry", message: "m", propertyId: "1" });
    realNotificationService.__reset();
    expect(realNotificationService.getAll()).toHaveLength(0);
  });

  it("each notification gets a unique id", () => {
    const a = realNotificationService.create({ type: "ReportExpiry", message: "m", propertyId: "1" });
    const b = realNotificationService.create({ type: "ReportExpiry", message: "m", propertyId: "1" });
    expect(a.id).not.toBe(b.id);
  });

  it("createdAt is a recent ms timestamp", () => {
    const before = Date.now();
    const n = realNotificationService.create({ type: "ReportExpiry", message: "m", propertyId: "1" });
    const after = Date.now();
    expect(n.createdAt).toBeGreaterThanOrEqual(before);
    expect(n.createdAt).toBeLessThanOrEqual(after);
  });
});
