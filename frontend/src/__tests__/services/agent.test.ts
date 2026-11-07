/**
 * agentService — real logic worth locking down:
 *   - register/updateProfile/verifyAgent throw when the canister returns Err
 *   - fromRawProfile converts principal, nanosecond timestamps, and numbers
 *   - getMyProfile returns null for an empty opt array, the profile otherwise
 *   - reset() forces a fresh actor to be created on the next call
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@homegentic/shared/declarations/agent", () => ({ idlFactory: vi.fn() }));
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
import { hasErrorCode, errorMessage } from "@/services/candid";

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

// Test-gap audit 2026-11-03 (M2): canister errors reach the page as typed
// CanisterErrors, so the toast shows the canister's sentence, never JSON.
describe("agentService errors and the remaining calls", () => {
  const input = {
    name: "J", brokerage: "B", licenseNumber: "L", licenseState: "FL", county: "Orange",
    serviceCities: ["orlando"], bio: "", phone: "", email: "j@x.com",
  };

  it.each([
    ["register", () => agentService.register(input), "register"],
    ["updateProfile", () => agentService.updateProfile(input), "updateProfile"],
    ["setCardOnFile", () => agentService.setCardOnFile(true), "setCardOnFile"],
    ["verifyAgent", () => agentService.verifyAgent("p"), "verifyAgent"],
    ["addReview", () => agentService.addReview("p", 5, "great", "t1"), "addReview"],
  ] as const)("%s throws a typed error with the canister's text", async (_n, call, method) => {
    (mockActor as any)[method].mockResolvedValue({ err: { InvalidInput: "License number is required." } });
    const err = await call().catch((e) => e);
    expect(hasErrorCode(err, "InvalidInput")).toBe(true);
    expect(errorMessage(err, "fallback")).toBe("License number is required.");
  });

  it("a tag without text gets the shared copy, not JSON", async () => {
    mockActor.setCardOnFile.mockResolvedValue({ err: { NotAuthorized: null } });
    const err = await agentService.setCardOnFile(true).catch((e) => e);
    expect(errorMessage(err, "fallback")).not.toMatch(/[{}]/);
  });

  it("updateProfile, getProfile, isVerifiedAgent, addReview and getReviews decode results", async () => {
    mockActor.updateProfile.mockResolvedValue({ ok: makeRawProfile({ county: "Orange" }) });
    mockActor.getProfile.mockResolvedValue([makeRawProfile()]);
    mockActor.isVerifiedAgent.mockResolvedValue(true);
    const rawReview = {
      id: "rv1", agentId: { toText: () => "agent-principal" }, reviewerPrincipal: { toText: () => "owner" },
      rating: 5n, comment: "great", transactionId: "t1", createdAt: 2_000n * 1_000_000n,
    };
    mockActor.addReview.mockResolvedValue({ ok: rawReview });
    mockActor.getReviews.mockResolvedValue([rawReview]);

    expect((await agentService.updateProfile(input)).county).toBe("Orange");
    expect((await agentService.getProfile("agent-principal"))?.name).toBe("Jane Realtor");
    expect(await agentService.isVerifiedAgent("agent-principal")).toBe(true);
    expect(await agentService.addReview("agent-principal", 5, "great", "t1")).toEqual({
      id: "rv1", agentId: "agent-principal", reviewerPrincipal: "owner", rating: 5, comment: "great", transactionId: "t1", createdAt: 2_000,
    });
    expect(mockActor.addReview.mock.calls[0][0]).toMatchObject({ rating: 5n, comment: "great", transactionId: "t1" });
    expect(await agentService.getReviews("agent-principal")).toHaveLength(1);
  });

  it("getProfile returns null for an unknown agent", async () => {
    mockActor.getProfile.mockResolvedValue([]);
    expect(await agentService.getProfile("nobody")).toBeNull();
  });
});
