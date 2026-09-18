/**
 * agentService — real logic worth locking down:
 *   - register/updateProfile/verifyAgent throw when the canister returns Err
 *   - fromRawProfile converts principal, nanosecond timestamps, and numbers
 *   - getMyProfile returns null for an empty opt array, the profile otherwise
 *   - reset() forces a fresh actor to be created on the next call
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@/declarations/agent", () => ({ idlFactory: vi.fn() }));
vi.mock("@icp-sdk/core/principal", () => ({
  Principal: { fromText: vi.fn((t: string) => ({ toText: () => t })) },
}));

const mockActor = {
  register: vi.fn(), getMyProfile: vi.fn(), getProfile: vi.fn(),
  updateProfile: vi.fn(), setCardOnFile: vi.fn(), verifyAgent: vi.fn(),
  isVerifiedAgent: vi.fn(), addReview: vi.fn(), getReviews: vi.fn(),
};
const { mockCreateActor } = vi.hoisted(() => ({ mockCreateActor: vi.fn() }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: mockCreateActor },
  HttpAgent: vi.fn(),
}));

import { agentService } from "@/services/agent";

function makeRawProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: { toText: () => "agent-principal" }, name: "Jane Realtor", brokerage: "ACME Realty",
    licenseNumber: "TX-1234", licenseState: "TX", county: "Travis", serviceCities: ["Austin"],
    bio: "10 years experience", phone: "555-0100", email: "jane@example.com",
    avgDaysOnMarket: BigInt(25), listingsLast12Months: BigInt(30), isVerified: true,
    lastVerifiedAt: BigInt(1_700_000_000_000) * BigInt(1_000_000),
    cardOnFile: true, createdAt: BigInt(1_600_000_000_000) * BigInt(1_000_000), updatedAt: BigInt(1_700_000_000_000) * BigInt(1_000_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateActor.mockReturnValue(mockActor);
  agentService.reset();
});

describe("agentService.register", () => {
  it("converts the raw profile on success", async () => {
    mockActor.register.mockResolvedValue({ ok: makeRawProfile() });
    const profile = await agentService.register({
      name: "Jane Realtor", brokerage: "ACME Realty", licenseNumber: "TX-1234",
      licenseState: "TX", county: "Travis", serviceCities: ["Austin"], bio: "10 years", phone: "555-0100", email: "jane@example.com",
    });
    expect(profile.id).toBe("agent-principal");
    expect(profile.avgDaysOnMarket).toBe(25);
    expect(profile.lastVerifiedAt).toBe(1_700_000_000_000);
  });

  it("throws when the canister returns Err", async () => {
    mockActor.register.mockResolvedValue({ err: { AlreadyRegistered: null } });
    await expect(agentService.register({} as any)).rejects.toThrow();
  });
});

describe("agentService.getMyProfile", () => {
  it("returns null for an empty opt array", async () => {
    mockActor.getMyProfile.mockResolvedValue([]);
    expect(await agentService.getMyProfile()).toBeNull();
  });

  it("returns the converted profile when present", async () => {
    mockActor.getMyProfile.mockResolvedValue([makeRawProfile()]);
    const profile = await agentService.getMyProfile();
    expect(profile?.name).toBe("Jane Realtor");
  });
});

describe("agentService.verifyAgent", () => {
  it("throws on Err", async () => {
    mockActor.verifyAgent.mockResolvedValue({ err: { NotFound: null } });
    await expect(agentService.verifyAgent("some-principal")).rejects.toThrow();
  });

  it("returns the converted profile on success", async () => {
    mockActor.verifyAgent.mockResolvedValue({ ok: makeRawProfile({ isVerified: true }) });
    const profile = await agentService.verifyAgent("some-principal");
    expect(profile.isVerified).toBe(true);
  });
});

describe("agentService — actor caching", () => {
  it("creates the actor once and reuses it, then recreates after reset()", async () => {
    mockActor.getMyProfile.mockResolvedValue([]);
    await agentService.getMyProfile();
    await agentService.getMyProfile();
    expect(mockCreateActor).toHaveBeenCalledTimes(1);

    agentService.reset();
    await agentService.getMyProfile();
    expect(mockCreateActor).toHaveBeenCalledTimes(2);
  });
});
