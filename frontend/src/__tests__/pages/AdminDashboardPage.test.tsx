/**
 * AdminDashboardPage — real logic worth locking down:
 *   - admin gating: loading while isAdmin resolves, redirect for non-admins
 *   - Verifications tab: approve (Basic/Premium) and reject remove the
 *     property from the pending list and call the right service args
 *   - Contractors tab: unverified/verified split, verify updates in place
 *   - Tier Manager: blank-principal validation, tier selection, success
 *     clears the input
 *   - Cycles dashboard: runway-based at-risk banner, critical/warning counts
 *   - Referral pipeline: pending vs collected fee totals, floor badge
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import type { Property } from "@/services/property";
import type { CanisterMetrics, CycleLevelResult } from "@/services/monitoringService";
import type { Job } from "@/services/job";
import type { ContractorProfile } from "@/services/contractor";

const { mockUseAuthStore } = vi.hoisted(() => ({ mockUseAuthStore: vi.fn() }));
vi.mock("@/store/authStore", () => ({ useAuthStore: mockUseAuthStore }));

const {
  mockIsAdmin, mockGetPendingVerifications, mockVerifyProperty, mockSetTier,
} = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
  mockGetPendingVerifications: vi.fn(),
  mockVerifyProperty: vi.fn(),
  mockSetTier: vi.fn(),
}));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return {
    ...actual,
    propertyService: {
      isAdmin: mockIsAdmin,
      getPendingVerifications: mockGetPendingVerifications,
      verifyProperty: mockVerifyProperty,
      setTier: mockSetTier,
    },
  };
});

const {
  mockGetAllCanisterMetrics, mockGetMetrics, mockCheckCycleLevels,
} = vi.hoisted(() => ({
  mockGetAllCanisterMetrics: vi.fn(),
  mockGetMetrics: vi.fn(),
  mockCheckCycleLevels: vi.fn(),
}));
vi.mock("@/services/monitoringService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/monitoringService")>();
  return {
    ...actual,
    monitoringService: {
      getAllCanisterMetrics: mockGetAllCanisterMetrics,
      getMetrics: mockGetMetrics,
      checkCycleLevels: mockCheckCycleLevels,
    },
  };
});

const { mockGetReferralJobs } = vi.hoisted(() => ({ mockGetReferralJobs: vi.fn() }));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getReferralJobs: mockGetReferralJobs } };
});

const { mockSearch, mockVerifyContractor } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockVerifyContractor: vi.fn(),
}));
vi.mock("@/services/contractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/contractor")>();
  return { ...actual, contractorService: { search: mockSearch, verifyContractor: mockVerifyContractor } };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "Unverified" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<CanisterMetrics> = {}): CanisterMetrics {
  return {
    canisterId: "canister-aaaa-bbbb-cccc-dddd", cyclesBalance: 2_000_000_000_000, cyclesBurned: 10_000_000_000,
    memoryBytes: 1_000_000, memoryCapacity: 4_000_000, requestCount: 100, errorCount: 0,
    avgResponseTimeMs: 50, updatedAt: Date.now() * 1_000_000,
    ...overrides,
  };
}

function makeLevel(overrides: Partial<CycleLevelResult> = {}): CycleLevelResult {
  return { id: "canister-1", name: "property", cycles: 2_000_000_000_000, status: "ok", fromCache: false, ...overrides };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 100_000, date: "2024-06-01", description: "", isDiy: false,
    status: "Completed" as any, verified: false, homeownerSigned: true, contractorSigned: true,
    photos: [], createdAt: Date.now(), sourceQuoteId: "quote-1",
    ...overrides,
  } as Job;
}

function makeContractor(overrides: Partial<ContractorProfile> = {}): ContractorProfile {
  return {
    id: "ctr-1", name: "Alice Anderson", specialties: ["HVAC"], email: "a@example.com", phone: "555-0100",
    bio: null, licenseNumber: "LIC-1", serviceArea: null, serviceZips: [], trustScore: 80, jobsCompleted: 5,
    isVerified: false, createdAt: Date.now(), origin: { type: "SelfRegistered" },
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthStore.mockReturnValue({ isAuthenticated: true, principal: "p-admin" });
  mockIsAdmin.mockResolvedValue(true);
  mockGetPendingVerifications.mockResolvedValue([]);
  mockGetAllCanisterMetrics.mockResolvedValue([]);
  mockGetMetrics.mockResolvedValue({ totalCanisters: 0, activeAlerts: 0, criticalAlerts: 0, isPaused: false, cyclesPerCall: [] });
  mockCheckCycleLevels.mockResolvedValue([]);
  mockGetReferralJobs.mockResolvedValue([]);
  mockSearch.mockResolvedValue([]);
});

describe("AdminDashboardPage — access gating", () => {
  it("redirects non-admins to /dashboard", async () => {
    mockIsAdmin.mockResolvedValue(false);
    renderPage();
    await waitFor(() => expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument());
  });

  it("shows the dashboard for admins", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
  });

  it("does not check admin status until a principal is available", () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true, principal: null });
    renderPage();
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });
});

describe("AdminDashboardPage — verifications tab", () => {
  it("shows the empty state when nothing is pending", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("No pending verifications. All caught up!")).toBeInTheDocument());
  });

  it("approves a property at the selected level and removes it from the list", async () => {
    mockGetPendingVerifications.mockResolvedValue([makeProperty({ id: "prop-1", address: "123 Main St" })]);
    mockVerifyProperty.mockResolvedValue(makeProperty({ verificationLevel: "Premium" as any }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/123 Main St/)).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue("Basic (Utility Bill)"), { target: { value: "Premium" } });
    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() => expect(mockVerifyProperty).toHaveBeenCalledWith("prop-1", "Premium"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Property approved as Premium");
    await waitFor(() => expect(screen.queryByText(/123 Main St/)).not.toBeInTheDocument());
  });

  it("rejects a property back to Unverified and removes it from the list", async () => {
    mockGetPendingVerifications.mockResolvedValue([makeProperty({ id: "prop-1", address: "123 Main St" })]);
    mockVerifyProperty.mockResolvedValue(makeProperty({ verificationLevel: "Unverified" as any }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/123 Main St/)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() => expect(mockVerifyProperty).toHaveBeenCalledWith("prop-1", "Unverified"));
    await waitFor(() => expect(screen.queryByText(/123 Main St/)).not.toBeInTheDocument());
  });

  it("shows the pending count and action-needed badge in the metrics bar and tab label", async () => {
    mockGetPendingVerifications.mockResolvedValue([makeProperty({ id: "prop-1" }), makeProperty({ id: "prop-2" })]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Action needed")).toBeInTheDocument());
    expect(screen.getByText("Verifications (2)")).toBeInTheDocument();
  });
});

describe("AdminDashboardPage — contractors tab", () => {
  it("splits contractors into unverified and verified counts", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", isVerified: false }),
      makeContractor({ id: "c2", isVerified: true }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Contractors"));

    await waitFor(() => expect(screen.getByText("1 unverified · 1 verified")).toBeInTheDocument());
  });

  it("verifies a contractor and moves it out of the unverified table", async () => {
    mockSearch.mockResolvedValue([makeContractor({ id: "c1", name: "Alice Anderson", isVerified: false })]);
    mockVerifyContractor.mockResolvedValue(makeContractor({ id: "c1", isVerified: true }));
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Contractors"));

    await waitFor(() => expect(screen.getByText("Alice Anderson")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Verify"));

    await waitFor(() => expect(mockVerifyContractor).toHaveBeenCalledWith("c1"));
    expect(mockToastSuccess).toHaveBeenCalledWith("Contractor verified");
    await waitFor(() => expect(screen.getByText("All contractors are verified.")).toBeInTheDocument());
  });

  it("shows the guest-signed source and originating job for a #518 auto-created profile", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({
        id: "c1", name: "Jane Contractor", isVerified: false,
        origin: { type: "GuestSigned", jobId: "JOB_42" },
      }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Contractors"));

    await waitFor(() => expect(screen.getByText("Jane Contractor")).toBeInTheDocument());
    expect(screen.getByText("Guest-signed (Job #JOB_42)")).toBeInTheDocument();
  });

  it("shows self-registered as the source for a normally-registered contractor", async () => {
    mockSearch.mockResolvedValue([
      makeContractor({ id: "c1", name: "Alice Anderson", isVerified: false, origin: { type: "SelfRegistered" } }),
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Contractors"));

    await waitFor(() => expect(screen.getByText("Alice Anderson")).toBeInTheDocument());
    expect(screen.getByText("Self-registered")).toBeInTheDocument();
  });
});

describe("AdminDashboardPage — tier manager tab", () => {
  async function goToTiers() {
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Subscription Tiers"));
    await waitFor(() => expect(screen.getByText("Set Subscription Tier")).toBeInTheDocument());
  }

  it("blocks Set Tier for a blank principal", async () => {
    await goToTiers();
    expect(screen.getByText("Set Tier")).toBeDisabled();
  });

  it("sets the selected tier for the entered principal and clears the input on success", async () => {
    mockSetTier.mockResolvedValue(undefined);
    await goToTiers();

    fireEvent.change(screen.getByPlaceholderText("abc12-xyz34-..."), { target: { value: "user-principal-123" } });
    fireEvent.click(screen.getByRole("button", { name: "ContractorPro" }));
    fireEvent.click(screen.getByText("Set Tier"));

    await waitFor(() => expect(mockSetTier).toHaveBeenCalledWith("user-principal-123", "ContractorPro"));
    await waitFor(() => expect(screen.getByPlaceholderText("abc12-xyz34-...")).toHaveValue(""));
  });

  it("shows an error toast and keeps the input when setTier fails", async () => {
    mockSetTier.mockRejectedValue(new Error("Invalid principal"));
    await goToTiers();

    fireEvent.change(screen.getByPlaceholderText("abc12-xyz34-..."), { target: { value: "bad-principal" } });
    fireEvent.click(screen.getByText("Set Tier"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Invalid principal"));
    expect(screen.getByPlaceholderText("abc12-xyz34-...")).toHaveValue("bad-principal");
  });
});

describe("AdminDashboardPage — cycles dashboard tab", () => {
  async function goToCycles() {
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Cycles & Health"));
  }

  it("shows the at-risk banner when a canister is below the runway warning threshold", async () => {
    mockGetAllCanisterMetrics.mockResolvedValue([
      makeMetrics({ canisterId: "low-runway", cyclesBalance: 100_000_000, cyclesBurned: 10_000_000 }), // 10 days
    ]);
    await goToCycles();
    await waitFor(() => expect(screen.getByText(/canister.*below 30-day runway/)).toBeInTheDocument());
  });

  it("does not show the at-risk banner when all canisters have healthy runway", async () => {
    mockGetAllCanisterMetrics.mockResolvedValue([makeMetrics({ cyclesBalance: 2_000_000_000_000, cyclesBurned: 1_000_000_000 })]);
    await goToCycles();
    await waitFor(() => expect(screen.getByText("Total Balance")).toBeInTheDocument());
    expect(screen.queryByText(/below 30-day runway/)).not.toBeInTheDocument();
  });

  it("summarizes critical and warning cycle-level counts", async () => {
    mockCheckCycleLevels.mockResolvedValue([
      makeLevel({ id: "l1", status: "critical" }),
      makeLevel({ id: "l2", status: "warning" }),
      makeLevel({ id: "l3", status: "ok" }),
    ]);
    await goToCycles();
    await waitFor(() => expect(screen.getByText("1 critical")).toBeInTheDocument());
    expect(screen.getByText("1 warning")).toBeInTheDocument();
  });

  it("shows 'all OK' when no cycle levels are critical or warning", async () => {
    mockCheckCycleLevels.mockResolvedValue([makeLevel({ id: "l1", status: "ok" })]);
    await goToCycles();
    await waitFor(() => expect(screen.getByText("all OK")).toBeInTheDocument());
  });

  it("re-polls cycle levels on demand", async () => {
    mockCheckCycleLevels.mockResolvedValue([]);
    await goToCycles();
    await waitFor(() => expect(screen.getByText("Poll Now")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Poll Now"));
    await waitFor(() => expect(mockCheckCycleLevels).toHaveBeenCalledTimes(2)); // initial load + manual poll
  });
});

describe("AdminDashboardPage — referral pipeline tab", () => {
  async function goToReferrals() {
    renderPage();
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Referral Fees"));
  }

  it("shows the empty state with no referral jobs", async () => {
    await goToReferrals();
    await waitFor(() => expect(screen.getByText(/No referral jobs yet/)).toBeInTheDocument());
  });

  it("splits pending (unverified) vs collected (verified) fee totals", async () => {
    mockGetReferralJobs.mockResolvedValue([
      makeJob({ id: "j1", amount: 100_000, verified: false }), // pending: 3% of $1000 = $30
      makeJob({ id: "j2", amount: 200_000, verified: true }),  // collected: 3% of $2000 = $60
    ]);
    await goToReferrals();

    await waitFor(() => expect(screen.getByText("$30.00")).toBeInTheDocument());
    // "$60.00" appears twice: once in the summary card, once in the verified job's table row fee column
    expect(screen.getAllByText("$60.00")).toHaveLength(2);
    expect(screen.getByText("1 awaiting verification")).toBeInTheDocument();
    expect(screen.getByText("1 verified jobs")).toBeInTheDocument();
  });

  it("shows the MIN badge for a job under the fee floor and 'Pending' for unverified rows", async () => {
    mockGetReferralJobs.mockResolvedValue([
      makeJob({ id: "j1", amount: 10_000, verified: true }),  // 3% of $100 = $3, floored to $20
      makeJob({ id: "j2", amount: 50_000, verified: false }),
    ]);
    await goToReferrals();

    await waitFor(() => expect(screen.getByText("MIN")).toBeInTheDocument());
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});
