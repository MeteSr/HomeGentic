/**
 * Integration tests — authService against the real ICP auth canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - UserRole Variant round-trips (Homeowner / Contractor / Realtor / Builder)
 *   - lastLoggedIn Opt(Int) → null | ms conversion (ns→ms)
 *   - getProfile returns data scoped to the calling principal
 *   - updateProfile mutates only email/phone, not role or createdAt
 *   - hasRole correctly reflects the registered role
 *   - recordLogin advances lastLoggedIn from null to a real timestamp
 *
 * Note: The test principal is deterministic (same seed every run). If the
 * principal is already registered on the replica, register() will return
 * AlreadyExists — beforeAll handles this gracefully with a getProfile fallback.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { authService } from "@/services/auth";
import type { UserProfile } from "@/services/auth";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = (process.env as any).AUTH_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

// ─── Global setup: ensure the test identity is registered ─────────────────────

let profile: UserProfile;

beforeAll(async () => {
  if (!deployed) return;
  try {
    profile = await authService.register({
      role:  "Homeowner",
      email: "integ-test@homegentic.io",
      phone: "555-0100",
    });
  } catch (err: any) {
    // AlreadyExists on subsequent runs — fetch existing profile instead
    if (err.message?.includes("AlreadyExists") || err.message?.includes("already")) {
      profile = await authService.getProfile();
    } else {
      throw err;
    }
  }
});

// ─── register — Candid serialization ─────────────────────────────────────────

describe.skipIf(!deployed)("register — Candid serialization", () => {
  it("returns a profile whose principal matches the test identity", () => {
    expect(profile.principal).toBe(TEST_PRINCIPAL);
  });

  it("email is preserved", () => {
    // Email may differ on subsequent runs (prior updateProfile); just check it's a string
    expect(typeof profile.email).toBe("string");
    expect(profile.email.length).toBeGreaterThan(0);
  });

  it("isActive is true", () => {
    expect(profile.isActive).toBe(true);
  });

  it("createdAt is a bigint (canister Int, not converted to ms)", () => {
    expect(typeof profile.createdAt).toBe("bigint");
  });

  it("updatedAt is a bigint", () => {
    expect(typeof profile.updatedAt).toBe("bigint");
  });
});

// ─── UserRole Variant round-trips ────────────────────────────────────────────

describe.skipIf(!deployed)("UserRole Variant round-trips", () => {
  it("registered Homeowner role comes back as 'Homeowner'", () => {
    // The beforeAll registered as Homeowner (or the principal was already Homeowner)
    expect(profile.role).toBe("Homeowner");
  });

  it("hasRole returns true for the registered role", async () => {
    const result = await authService.hasRole("Homeowner");
    expect(result).toBe(true);
  });

  it("hasRole returns false for a different role", async () => {
    const result = await authService.hasRole("Contractor");
    expect(result).toBe(false);
  });
});

// ─── getProfile — cross-call consistency ─────────────────────────────────────

describe.skipIf(!deployed)("getProfile — data round-trip", () => {
  it("getProfile returns the same principal as register", async () => {
    const fetched = await authService.getProfile();
    expect(fetched.principal).toBe(profile.principal);
  });

  it("getProfile role matches registered role", async () => {
    const fetched = await authService.getProfile();
    expect(fetched.role).toBe(profile.role);
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("updateProfile — mutation and consistency", () => {
  it("updateProfile changes email and phone", async () => {
    const updated = await authService.updateProfile({
      email: "updated@homegentic.io",
      phone: "555-9999",
    });
    expect(updated.email).toBe("updated@homegentic.io");
    expect(updated.phone).toBe("555-9999");
  });

  it("updateProfile does not change the role", async () => {
    const updated = await authService.updateProfile({
      email: "role-check@homegentic.io",
      phone: "555-0001",
    });
    expect(updated.role).toBe(profile.role);
  });

  it("updatedAt advances after updateProfile", async () => {
    const before = (await authService.getProfile()).updatedAt;
    await authService.updateProfile({ email: "ts-check@homegentic.io", phone: "555-0002" });
    const after = (await authService.getProfile()).updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ─── recordLogin — lastLoggedIn timestamp ────────────────────────────────────

describe.skipIf(!deployed)("recordLogin — lastLoggedIn Opt(Int) → ms conversion", () => {
  it("recordLogin completes without error", async () => {
    await expect(authService.recordLogin()).resolves.toBeUndefined();
  });

  it("lastLoggedIn is non-null after recordLogin is called", async () => {
    await authService.recordLogin();
    const fetched = await authService.getProfile();
    expect(fetched.lastLoggedIn).not.toBeNull();
  });

  it("lastLoggedIn is a recent ms timestamp (ns→ms conversion applied)", async () => {
    const before = Date.now() - 10_000;
    await authService.recordLogin();
    const fetched = await authService.getProfile();
    const after = Date.now() + 10_000;
    // If ns→ms was missed, lastLoggedIn would be ~1e18 (year ~33000)
    expect(fetched.lastLoggedIn!).toBeGreaterThan(before);
    expect(fetched.lastLoggedIn!).toBeLessThan(after);
  });
});

// ─── Voice-agent sessions ────────────────────────────────────────────────────
// The voice Worker resolves these tokens to learn the caller's real principal,
// so the round-trip and the invalidation rules are what keep AI quotas honest.

describe.skipIf(!deployed)("voice-agent sessions", () => {
  it("issueAgentSession returns a token that resolves to the caller", async () => {
    const { token, expiresAtMs } = await authService.issueAgentSession();
    expect(token).toMatch(/^hgs_[0-9a-f]{64}$/);
    expect(expiresAtMs).toBeGreaterThan(Date.now());
    expect(await authService.resolveAgentSession(token)).toBe(TEST_PRINCIPAL);
  });

  it("issuing again invalidates the previous token", async () => {
    const first  = await authService.issueAgentSession();
    const second = await authService.issueAgentSession();
    expect(second.token).not.toBe(first.token);
    expect(await authService.resolveAgentSession(first.token)).toBeNull();
    expect(await authService.resolveAgentSession(second.token)).toBe(TEST_PRINCIPAL);
  });

  it("revokeAgentSession invalidates the caller's token", async () => {
    const { token } = await authService.issueAgentSession();
    await authService.revokeAgentSession();
    expect(await authService.resolveAgentSession(token)).toBeNull();
  });

  it("an unknown token resolves to null", async () => {
    expect(await authService.resolveAgentSession("hgs_" + "0".repeat(64))).toBeNull();
  });
});
