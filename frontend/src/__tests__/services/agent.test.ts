import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => ({})) } }));

import { agentService, computeAverageRating } from "@/services/agent";

function reset() { (agentService as any).__reset(); }

// ─── createProfile ────────────────────────────────────────────────────────────

describe("agentService.createProfile", () => {
  beforeEach(reset);

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
});

// ─── getMyProfile ─────────────────────────────────────────────────────────────

describe("agentService.getMyProfile", () => {
  beforeEach(reset);

  it("returns null when no profile exists", async () => {
    expect(await agentService.getMyProfile()).toBeNull();
  });

  it("returns the profile after creation", async () => {
    await agentService.createProfile({
      name: "Jane", brokerage: "Realty", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    });
    const p = await agentService.getMyProfile();
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Jane");
  });
});

// ─── getPublicProfile ─────────────────────────────────────────────────────────

describe("agentService.getPublicProfile", () => {
  beforeEach(reset);

  it("returns null for unknown principal", async () => {
    expect(await agentService.getPublicProfile("unknown-principal")).toBeNull();
  });

  it("returns profile by id after creation", async () => {
    const created = await agentService.createProfile({
      name: "Jane", brokerage: "Realty", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    });
    const found = await agentService.getPublicProfile(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Jane");
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe("agentService.updateProfile", () => {
  beforeEach(reset);

  it("updates mutable fields", async () => {
    await agentService.createProfile({
      name: "Jane", brokerage: "Old Brokerage", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    });
    const updated = await agentService.updateProfile({
      name: "Jane Smith", brokerage: "New Brokerage", licenseNumber: "TX-1",
      statesLicensed: ["TX", "OK"], bio: "Updated bio", phone: "512-555-0199", email: "jane@new.com",
    });
    expect(updated.brokerage).toBe("New Brokerage");
    expect(updated.statesLicensed).toContain("OK");
    expect(updated.bio).toBe("Updated bio");
  });

  it("preserves isVerified across updates", async () => {
    await agentService.createProfile({
      name: "Jane", brokerage: "Realty", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    });
    const updated = await agentService.updateProfile({
      name: "Jane", brokerage: "Realty 2", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    });
    expect(updated.isVerified).toBe(false);
  });

  it("throws when no profile exists", async () => {
    await expect(agentService.updateProfile({
      name: "Jane", brokerage: "Realty", licenseNumber: "TX-1",
      statesLicensed: ["TX"], bio: "", phone: "", email: "",
    })).rejects.toThrow();
  });
});

// ─── getAllProfiles ───────────────────────────────────────────────────────────

describe("agentService.getAllProfiles", () => {
  beforeEach(reset);

  it("returns empty array initially", async () => {
    expect(await agentService.getAllProfiles()).toHaveLength(0);
  });

  it("returns all created profiles", async () => {
    await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    // mock mode uses _myId = "local" for all callers — only one profile per session
    const all = await agentService.getAllProfiles();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── addReview ────────────────────────────────────────────────────────────────

describe("agentService.addReview", () => {
  beforeEach(reset);

  it("creates a review with the supplied fields", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    const review = await agentService.addReview({
      agentId: agent.id, rating: 5, comment: "Excellent agent", transactionId: "TXN_1",
    });
    expect(review.agentId).toBe(agent.id);
    expect(review.rating).toBe(5);
    expect(review.comment).toBe("Excellent agent");
    expect(review.transactionId).toBe("TXN_1");
  });

  it("throws for rating above 5", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    await expect(agentService.addReview({ agentId: agent.id, rating: 6, comment: "", transactionId: "T1" })).rejects.toThrow();
  });

  it("throws for rating of 0", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    await expect(agentService.addReview({ agentId: agent.id, rating: 0, comment: "", transactionId: "T2" })).rejects.toThrow();
  });

  it("throws when reviewing a non-existent agent", async () => {
    await expect(agentService.addReview({ agentId: "ghost", rating: 5, comment: "", transactionId: "T1" })).rejects.toThrow();
  });

  it("prevents duplicate review for same transaction", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    await agentService.addReview({ agentId: agent.id, rating: 4, comment: "Good", transactionId: "TXN_DUP" });
    await expect(agentService.addReview({ agentId: agent.id, rating: 5, comment: "Great", transactionId: "TXN_DUP" })).rejects.toThrow();
  });
});

// ─── getReviews ───────────────────────────────────────────────────────────────

describe("agentService.getReviews", () => {
  beforeEach(reset);

  it("returns empty array for agent with no reviews", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    expect(await agentService.getReviews(agent.id)).toHaveLength(0);
  });

  it("returns all reviews for the agent", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    await agentService.addReview({ agentId: agent.id, rating: 5, comment: "Great", transactionId: "T1" });
    await agentService.addReview({ agentId: agent.id, rating: 4, comment: "Good",  transactionId: "T2" });
    expect(await agentService.getReviews(agent.id)).toHaveLength(2);
  });

  it("does not return reviews belonging to a different agent id", async () => {
    const agent = await agentService.createProfile({ name: "Jane", brokerage: "A", licenseNumber: "TX-1", statesLicensed: [], bio: "", phone: "", email: "" });
    await agentService.addReview({ agentId: agent.id, rating: 5, comment: "Great", transactionId: "T1" });
    expect(await agentService.getReviews("different-agent-id")).toHaveLength(0);
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
