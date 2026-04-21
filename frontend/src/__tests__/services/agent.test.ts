import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Actor mock setup ──────────────────────────────────────────────────────────
// We intercept Actor.createActor so the service never touches the network.
// Each test configures mockActor methods as needed.

const mockActor: Record<string, ReturnType<typeof vi.fn>> = {
  register:       vi.fn(),
  getMyProfile:   vi.fn(),
  getProfile:     vi.fn(),
  getAllProfiles:  vi.fn(),
  updateProfile:  vi.fn(),
  addReview:      vi.fn(),
  getReviews:     vi.fn(),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockActor) },
}));
vi.mock("@icp-sdk/core/principal", () => ({
  Principal: { fromText: vi.fn((t: string) => ({ toText: () => t })) },
}));

import { agentService, computeAverageRating } from "@/services/agent";

// Helper: build a minimal raw canister profile
function rawProfile(overrides: Record<string, unknown> = {}) {
  return {
    id:                   { toText: () => "principal-abc" },
    name:                 "Jane Smith",
    brokerage:            "Premier Realty",
    licenseNumber:        "TX-12345",
    statesLicensed:       ["TX", "OK"],
    bio:                  "10 years in Austin metro",
    phone:                "512-555-0100",
    email:                "jane@example.com",
    avgDaysOnMarket:      BigInt(0),
    listingsLast12Months: BigInt(0),
    isVerified:           false,
    homeGenticTransactionCount: BigInt(0),
    typicalCommissionBps: BigInt(250),
    createdAt:            BigInt(0),
    updatedAt:            BigInt(0),
    ...overrides,
  };
}

// Helper: build a raw review
function rawReview(overrides: Record<string, unknown> = {}) {
  return {
    id:                "review-1",
    agentId:           { toText: () => "principal-abc" },
    reviewerPrincipal: { toText: () => "reviewer-xyz" },
    rating:            BigInt(5),
    comment:           "Excellent agent",
    transactionId:     "TXN_1",
    createdAt:         BigInt(0),
    ...overrides,
  };
}

function reset() { (agentService as any).__reset(); }

// ─── createProfile ────────────────────────────────────────────────────────────

describe("agentService.createProfile", () => {
  beforeEach(() => {
    reset();
    mockActor.register.mockResolvedValue({ ok: rawProfile() });
  });

  it("returns a profile with the supplied fields", async () => {
    const p = await agentService.createProfile({
      name: "Jane Smith", brokerage: "Premier Realty", licenseNumber: "TX-12345",
      statesLicensed: ["TX", "OK"], bio: "10 years in Austin metro",
      phone: "512-555-0100", email: "jane@example.com",
    });
    expect(p.name).toBe("Jane Smith");
    expect(p.brokerage).toBe("Premier Realty");
    expect(p.licenseNumber).toBe("TX-12345");
    expect(p.statesLicensed).toEqual(["TX", "OK"]);
    expect(p.bio).toBe("10 years in Austin metro");
  });

  it("initialises isVerified to false", async () => {
    const p = await agentService.createProfile({
      name: "Bob", brokerage: "Acme", licenseNumber: "CA-99",
      statesLicensed: ["CA"], bio: "", phone: "", email: "",
    });
    expect(p.isVerified).toBe(false);
  });

  it("initialises avgDaysOnMarket and listingsLast12Months to 0", async () => {
    const p = await agentService.createProfile({
      name: "Bob", brokerage: "Acme", licenseNumber: "CA-99",
      statesLicensed: ["CA"], bio: "", phone: "", email: "",
    });
    expect(p.avgDaysOnMarket).toBe(0);
    expect(p.listingsLast12Months).toBe(0);
  });

  it("assigns a non-empty id string", async () => {
    const p = await agentService.createProfile({
      name: "Bob", brokerage: "Acme", licenseNumber: "CA-99",
      statesLicensed: [], bio: "", phone: "", email: "",
    });
    expect(typeof p.id).toBe("string");
    expect(p.id.length).toBeGreaterThan(0);
  });

  it("throws when the canister returns an error", async () => {
    mockActor.register.mockResolvedValue({ err: { AlreadyExists: null } });
    await expect(agentService.createProfile({
      name: "Bob", brokerage: "Acme", licenseNumber: "CA-99",
      statesLicensed: [], bio: "", phone: "", email: "",
    })).rejects.toThrow();
  });
});

// ─── getMyProfile ─────────────────────────────────────────────────────────────

describe("agentService.getMyProfile", () => {
  beforeEach(reset);

  it("returns null when canister returns empty optional", async () => {
    mockActor.getMyProfile.mockResolvedValue([]);
    expect(await agentService.getMyProfile()).toBeNull();
  });

  it("returns the profile when canister returns a value", async () => {
    mockActor.getMyProfile.mockResolvedValue([rawProfile()]);
    const p = await agentService.getMyProfile();
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Jane Smith");
  });
});

// ─── getPublicProfile ─────────────────────────────────────────────────────────

describe("agentService.getPublicProfile", () => {
  beforeEach(reset);

  it("returns null for unknown principal", async () => {
    mockActor.getProfile.mockResolvedValue([]);
    expect(await agentService.getPublicProfile("unknown-principal")).toBeNull();
  });

  it("returns profile when canister returns a value", async () => {
    mockActor.getProfile.mockResolvedValue([rawProfile()]);
    const found = await agentService.getPublicProfile("principal-abc");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Jane Smith");
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe("agentService.updateProfile", () => {
  beforeEach(reset);

  it("returns the updated profile from the canister", async () => {
    mockActor.updateProfile.mockResolvedValue({
      ok: rawProfile({ name: "Jane Smith", brokerage: "New Brokerage" }),
    });
    const updated = await agentService.updateProfile({
      name: "Jane Smith", brokerage: "New Brokerage", licenseNumber: "TX-1",
      statesLicensed: ["TX", "OK"], bio: "Updated bio", phone: "512-555-0199", email: "jane@new.com",
    });
    expect(updated.brokerage).toBe("New Brokerage");
  });

  it("throws when the canister returns an error", async () => {
    mockActor.updateProfile.mockResolvedValue({ err: { NotFound: null } });
    await expect(agentService.updateProfile({
      name: "Jane", brokerage: "Realty", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    })).rejects.toThrow();
  });
});

// ─── getAllProfiles ───────────────────────────────────────────────────────────

describe("agentService.getAllProfiles", () => {
  beforeEach(reset);

  it("returns empty array when canister returns none", async () => {
    mockActor.getAllProfiles.mockResolvedValue([]);
    expect(await agentService.getAllProfiles()).toHaveLength(0);
  });

  it("maps all raw profiles returned by the canister", async () => {
    mockActor.getAllProfiles.mockResolvedValue([rawProfile(), rawProfile({ name: "Bob" })]);
    const all = await agentService.getAllProfiles();
    expect(all).toHaveLength(2);
  });
});

// ─── addReview ────────────────────────────────────────────────────────────────

describe("agentService.addReview", () => {
  beforeEach(reset);

  it("returns the review from the canister", async () => {
    mockActor.addReview.mockResolvedValue({ ok: rawReview() });
    const review = await agentService.addReview({
      agentId: "principal-abc", rating: 5, comment: "Excellent agent", transactionId: "TXN_1",
    });
    expect(review.agentId).toBe("principal-abc");
    expect(review.rating).toBe(5);
    expect(review.comment).toBe("Excellent agent");
    expect(review.transactionId).toBe("TXN_1");
  });

  it("throws when the canister returns an error", async () => {
    mockActor.addReview.mockResolvedValue({ err: { DuplicateReview: null } });
    await expect(agentService.addReview({
      agentId: "principal-abc", rating: 5, comment: "", transactionId: "TXN_DUP",
    })).rejects.toThrow();
  });
});

// ─── getReviews ───────────────────────────────────────────────────────────────

describe("agentService.getReviews", () => {
  beforeEach(reset);

  it("returns empty array when canister returns none", async () => {
    mockActor.getReviews.mockResolvedValue([]);
    expect(await agentService.getReviews("principal-abc")).toHaveLength(0);
  });

  it("maps all reviews returned by the canister", async () => {
    mockActor.getReviews.mockResolvedValue([
      rawReview({ transactionId: "T1" }),
      rawReview({ id: "review-2", transactionId: "T2" }),
    ]);
    expect(await agentService.getReviews("principal-abc")).toHaveLength(2);
  });
});

// ─── computeAverageRating (pure) ─────────────────────────────────────────────

describe("computeAverageRating", () => {
  it("returns 0 for empty reviews", () => {
    expect(computeAverageRating([])).toBe(0);
  });

  it("returns the single rating when there is one review", () => {
    expect(computeAverageRating([{
      id: "r1", agentId: "a", reviewerPrincipal: "p", rating: 4,
      comment: "", transactionId: "t", createdAt: 0,
    }])).toBe(4);
  });

  it("averages multiple ratings", () => {
    expect(computeAverageRating([
      { id: "r1", agentId: "a", reviewerPrincipal: "p1", rating: 5, comment: "", transactionId: "t1", createdAt: 0 },
      { id: "r2", agentId: "a", reviewerPrincipal: "p2", rating: 3, comment: "", transactionId: "t2", createdAt: 0 },
    ])).toBe(4);
  });
});
