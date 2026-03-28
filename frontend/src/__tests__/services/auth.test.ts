/**
 * Tests for auth.ts.
 *
 * The service has no mock-store fallback, so we mock @dfinity/agent and
 * @/services/actor to supply a fake canister actor with controllable responses.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock @dfinity/agent and actor helper ─────────────────────────────────────

const mockActor: Record<string, ReturnType<typeof vi.fn>> = {
  register:      vi.fn(),
  getProfile:    vi.fn(),
  updateProfile: vi.fn(),
  recordLogin:   vi.fn(),
  hasRole:       vi.fn(),
};

vi.mock("@dfinity/agent", () => ({
  Actor: {
    createActor: vi.fn(() => mockActor),
  },
  HttpAgent: vi.fn(),
}));

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import { authService } from "@/services/auth";
import type { UserProfile } from "@/services/auth";

// ─── Raw canister response builder ───────────────────────────────────────────

function makeRawProfile(overrides: {
  role?: string;
  email?: string;
  phone?: string;
  createdAt?: bigint;
  updatedAt?: bigint;
  isActive?: boolean;
  lastLoggedIn?: bigint | null;
} = {}): any {
  const lastLoggedIn = overrides.lastLoggedIn !== undefined
    ? (overrides.lastLoggedIn === null ? [] : [overrides.lastLoggedIn])
    : [];
  return {
    principal:    { toText: () => "2vxsx-fae" },
    role:         { [overrides.role ?? "Homeowner"]: null },
    email:        overrides.email        ?? "jane@example.com",
    phone:        overrides.phone        ?? "512-555-0100",
    createdAt:    overrides.createdAt    ?? BigInt(1_700_000_000_000_000_000),
    updatedAt:    overrides.updatedAt    ?? BigInt(1_700_000_000_000_000_000),
    isActive:     overrides.isActive     ?? true,
    lastLoggedIn,
  };
}

// ─── beforeEach: reset mock actor state ───────────────────────────────────────

beforeEach(() => {
  authService.reset();
  for (const fn of Object.values(mockActor)) fn.mockReset();
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("register", () => {
  it("resolves with a parsed UserProfile on ok", async () => {
    mockActor.register.mockResolvedValue({ ok: makeRawProfile({ role: "Contractor" }) });
    const result = await authService.register({ role: "Contractor", email: "c@example.com", phone: "555-0001" });
    expect(result.role).toBe("Contractor");
    expect(result.email).toBe("jane@example.com");
    expect(result.principal).toBe("2vxsx-fae");
  });

  it("throws the error key on AlreadyExists", async () => {
    mockActor.register.mockResolvedValue({ err: { AlreadyExists: null } });
    await expect(authService.register({ role: "Homeowner", email: "x@x.com", phone: "" }))
      .rejects.toThrow("AlreadyExists");
  });

  it("throws the message on InvalidInput", async () => {
    mockActor.register.mockResolvedValue({ err: { InvalidInput: "email is required" } });
    await expect(authService.register({ role: "Homeowner", email: "", phone: "" }))
      .rejects.toThrow("email is required");
  });
});

// ─── getProfile ───────────────────────────────────────────────────────────────

describe("getProfile", () => {
  it("resolves with a profile on ok", async () => {
    mockActor.getProfile.mockResolvedValue({ ok: makeRawProfile() });
    const p = await authService.getProfile();
    expect(p.email).toBe("jane@example.com");
    expect(p.isActive).toBe(true);
  });

  it("throws NotFound on err", async () => {
    mockActor.getProfile.mockResolvedValue({ err: { NotFound: null } });
    await expect(authService.getProfile()).rejects.toThrow("NotFound");
  });

  it("throws Paused when canister is paused", async () => {
    mockActor.getProfile.mockResolvedValue({ err: { Paused: null } });
    await expect(authService.getProfile()).rejects.toThrow("Paused");
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe("updateProfile", () => {
  it("resolves with updated profile on ok", async () => {
    mockActor.updateProfile.mockResolvedValue({
      ok: makeRawProfile({ email: "new@example.com", phone: "512-999-0001" }),
    });
    const p = await authService.updateProfile({ email: "new@example.com", phone: "512-999-0001" });
    expect(p.email).toBe("new@example.com");
  });

  it("throws NotAuthorized on err", async () => {
    mockActor.updateProfile.mockResolvedValue({ err: { NotAuthorized: null } });
    await expect(authService.updateProfile({ email: "", phone: "" })).rejects.toThrow("NotAuthorized");
  });
});

// ─── fromProfile — BigInt / Opt conversions ───────────────────────────────────

describe("fromProfile field conversions", () => {
  it("keeps createdAt / updatedAt as BigInt", async () => {
    const ts = BigInt(1_700_000_000_000_000_000);
    mockActor.getProfile.mockResolvedValue({ ok: makeRawProfile({ createdAt: ts, updatedAt: ts }) });
    const p = await authService.getProfile();
    expect(typeof p.createdAt).toBe("bigint");
    expect(typeof p.updatedAt).toBe("bigint");
    expect(p.createdAt).toBe(ts);
  });

  it("converts lastLoggedIn from nanoseconds to ms when present", async () => {
    // 1_700_000_000_000 ms → 1_700_000_000_000_000_000 ns
    const ns = BigInt(1_700_000_000_000) * BigInt(1_000_000);
    mockActor.getProfile.mockResolvedValue({ ok: makeRawProfile({ lastLoggedIn: ns }) });
    const p = await authService.getProfile();
    expect(p.lastLoggedIn).toBe(1_700_000_000_000);
  });

  it("returns null for lastLoggedIn when Opt is empty", async () => {
    mockActor.getProfile.mockResolvedValue({ ok: makeRawProfile({ lastLoggedIn: null }) });
    const p = await authService.getProfile();
    expect(p.lastLoggedIn).toBeNull();
  });

  it("maps all three roles correctly", async () => {
    for (const role of ["Homeowner", "Contractor", "Realtor"] as const) {
      mockActor.getProfile.mockResolvedValue({ ok: makeRawProfile({ role }) });
      authService.reset();
      const p = await authService.getProfile();
      expect(p.role).toBe(role);
    }
  });
});

// ─── hasRole ──────────────────────────────────────────────────────────────────

describe("hasRole", () => {
  it("returns true when actor says true", async () => {
    mockActor.hasRole.mockResolvedValue(true);
    expect(await authService.hasRole("Homeowner")).toBe(true);
  });

  it("returns false when actor says false", async () => {
    mockActor.hasRole.mockResolvedValue(false);
    expect(await authService.hasRole("Contractor")).toBe(false);
  });

  it("passes the role as a variant object to the actor", async () => {
    mockActor.hasRole.mockResolvedValue(true);
    await authService.hasRole("Realtor");
    expect(mockActor.hasRole).toHaveBeenCalledWith({ Realtor: null });
  });
});

// ─── recordLogin ──────────────────────────────────────────────────────────────

describe("recordLogin", () => {
  it("does not call the actor when AUTH_CANISTER_ID is empty", async () => {
    // In test env AUTH_CANISTER_ID is '' — recordLogin should return early
    await authService.recordLogin();
    expect(mockActor.recordLogin).not.toHaveBeenCalled();
  });
});
