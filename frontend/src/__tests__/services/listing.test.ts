import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock ICP dependencies (not needed by the mock path, but required so the module loads)
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@dfinity/agent", () => ({ Actor: { createActor: vi.fn(() => ({})) } }));

// Ensure Date.now() increments on every call so IDs are always distinct.
let _now = 3_000_000_000_000;
vi.spyOn(Date, "now").mockImplementation(() => ++_now);

import {
  listingService,
  computeNetProceeds,
  formatCommission,
  isDeadlinePassed,
} from "@/services/listing";
import type { ListingBidRequest, ListingProposal } from "@/services/listing";

// ─── computeNetProceeds (pure) ────────────────────────────────────────────────

describe("computeNetProceeds", () => {
  it("deducts commission and closing costs from sale price", () => {
    // $500,000 sale, 2.5% commission, 2% closing costs
    // net = 500_000_00 - (500_000_00 * 0.025) - (500_000_00 * 0.02)
    // net = 50_000_000 - 1_250_000 - 1_000_000 = 47_750_000 cents
    const net = computeNetProceeds(50_000_000, 250, 200);
    expect(net).toBe(47_750_000);
  });

  it("returns the full sale price when commission and closing costs are 0", () => {
    expect(computeNetProceeds(40_000_000, 0, 0)).toBe(40_000_000);
  });

  it("handles high commission (e.g. 600 bps = 6%)", () => {
    // $300,000, 6% commission, 0% closing → 300_000_00 * 0.94 = 28_200_000
    const net = computeNetProceeds(30_000_000, 600, 0);
    expect(net).toBe(28_200_000);
  });

  it("returns a number (not NaN)", () => {
    expect(computeNetProceeds(20_000_000, 250, 200)).not.toBeNaN();
  });

  it("two proposals on same price: lower commission yields higher net", () => {
    const low  = computeNetProceeds(50_000_000, 200, 200); // 2% commission
    const high = computeNetProceeds(50_000_000, 300, 200); // 3% commission
    expect(low).toBeGreaterThan(high);
  });
});

// ─── formatCommission (pure) ──────────────────────────────────────────────────

describe("formatCommission", () => {
  it("formats 250 bps as '2.50%'", () => {
    expect(formatCommission(250)).toBe("2.50%");
  });

  it("formats 300 bps as '3.00%'", () => {
    expect(formatCommission(300)).toBe("3.00%");
  });

  it("formats 275 bps as '2.75%'", () => {
    expect(formatCommission(275)).toBe("2.75%");
  });

  it("formats 0 bps as '0.00%'", () => {
    expect(formatCommission(0)).toBe("0.00%");
  });

  it("formats 600 bps as '6.00%'", () => {
    expect(formatCommission(600)).toBe("6.00%");
  });
});

// ─── isDeadlinePassed (pure) ──────────────────────────────────────────────────

describe("isDeadlinePassed", () => {
  it("returns true when deadline is in the past", () => {
    expect(isDeadlinePassed(Date.now() - 1000)).toBe(true);
  });

  it("returns false when deadline is in the future", () => {
    expect(isDeadlinePassed(Date.now() + 60_000)).toBe(false);
  });

  it("returns true for deadline of exactly 0", () => {
    expect(isDeadlinePassed(0)).toBe(true);
  });
});

// ─── createBidRequest (stateful mock) ────────────────────────────────────────

describe("listingService.createBidRequest", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("returns a ListingBidRequest with the supplied fields", async () => {
    const deadline = Date.now() + 7 * 86_400_000;
    const req = await svc.createBidRequest({
      propertyId:       "prop-1",
      targetListDate:   Date.now() + 30 * 86_400_000,
      desiredSalePrice: 55_000_000,
      notes:            "Prefer agents with condo experience",
      bidDeadline:      deadline,
    });
    expect(req.propertyId).toBe("prop-1");
    expect(req.desiredSalePrice).toBe(55_000_000);
    expect(req.notes).toBe("Prefer agents with condo experience");
    expect(req.bidDeadline).toBe(deadline);
  });

  it("assigns status 'Open'", async () => {
    const req = await svc.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.status).toBe("Open");
  });

  it("assigns homeowner 'local' in mock mode", async () => {
    const req = await svc.createBidRequest({
      propertyId: "prop-2", targetListDate: Date.now() + 14 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.homeowner).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const req = await svc.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(typeof req.id).toBe("string");
    expect(req.id.length).toBeGreaterThan(0);
  });

  it("two calls produce distinct ids", async () => {
    const a = await svc.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const b = await svc.createBidRequest({
      propertyId: "prop-2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(a.id).not.toBe(b.id);
  });

  it("accepts null desiredSalePrice", async () => {
    const req = await svc.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.desiredSalePrice).toBeNull();
  });

  it("assigns createdAt close to now", async () => {
    const before = Date.now();
    const req = await svc.createBidRequest({
      propertyId: "prop-1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    expect(req.createdAt).toBeGreaterThanOrEqual(before);
    expect(req.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

// ─── getMyBidRequests (stateful mock) ─────────────────────────────────────────

describe("listingService.getMyBidRequests", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("starts empty in a fresh module instance", async () => {
    const reqs = await svc.getMyBidRequests();
    expect(reqs).toHaveLength(0);
  });

  it("returns all created requests", async () => {
    await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.createBidRequest({
      propertyId: "p2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const reqs = await svc.getMyBidRequests();
    expect(reqs).toHaveLength(2);
  });

  it("returns a copy — mutating the array does not affect internal state", async () => {
    await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const first = await svc.getMyBidRequests();
    first.pop();
    const second = await svc.getMyBidRequests();
    expect(second).toHaveLength(1);
  });

  it("all returned requests have status 'Open' initially", async () => {
    await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const reqs = await svc.getMyBidRequests();
    expect(reqs.every(r => r.status === "Open")).toBe(true);
  });
});

// ─── getBidRequest (stateful mock) ────────────────────────────────────────────

describe("listingService.getBidRequest", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("finds a request by id", async () => {
    const created = await svc.createBidRequest({
      propertyId: "prop-99", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: 42_000_000, notes: "ocean view unit", bidDeadline: Date.now() + 86_400_000,
    });
    const found = await svc.getBidRequest(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.propertyId).toBe("prop-99");
    expect(found!.desiredSalePrice).toBe(42_000_000);
  });

  it("returns null for an unknown id", async () => {
    expect(await svc.getBidRequest("does-not-exist")).toBeNull();
  });

  it("returns null on fresh module with no requests", async () => {
    expect(await svc.getBidRequest("BID_1")).toBeNull();
  });
});

// ─── cancelBidRequest (stateful mock) ─────────────────────────────────────────

describe("listingService.cancelBidRequest", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("changes status from Open to Cancelled", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.cancelBidRequest(req.id);
    const updated = await svc.getBidRequest(req.id);
    expect(updated!.status).toBe("Cancelled");
  });

  it("cancelled request is still returned by getMyBidRequests", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.cancelBidRequest(req.id);
    const all = await svc.getMyBidRequests();
    expect(all.some(r => r.id === req.id && r.status === "Cancelled")).toBe(true);
  });

  it("throws when cancelling a non-existent request", async () => {
    await expect(svc.cancelBidRequest("ghost-id")).rejects.toThrow();
  });

  it("cancelling an already-Cancelled request throws", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.cancelBidRequest(req.id);
    await expect(svc.cancelBidRequest(req.id)).rejects.toThrow();
  });
});

// ─── getOpenBidRequests (agent view) ─────────────────────────────────────────

describe("listingService.getOpenBidRequests", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("returns only Open requests (not Cancelled or Awarded)", async () => {
    const open = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const toCancel = await svc.createBidRequest({
      propertyId: "p2", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.cancelBidRequest(toCancel.id);

    const results = await svc.getOpenBidRequests();
    expect(results.every(r => r.status === "Open")).toBe(true);
    expect(results.some(r => r.id === open.id)).toBe(true);
    expect(results.some(r => r.id === toCancel.id)).toBe(false);
  });

  it("returns empty array when no Open requests exist", async () => {
    expect(await svc.getOpenBidRequests()).toHaveLength(0);
  });

  it("excludes requests whose bidDeadline has passed", async () => {
    await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() - 1000, // already expired
    });
    const open = await svc.getOpenBidRequests();
    expect(open).toHaveLength(0);
  });
});

// ─── submitProposal (stateful mock) ───────────────────────────────────────────

describe("listingService.submitProposal", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("returns a ListingProposal with the supplied fields", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const proposal = await svc.submitProposal(req.id, {
      agentName:             "Jane Smith",
      agentBrokerage:        "Premier Realty",
      commissionBps:         250,
      cmaSummary:            "Comps suggest $520k–$540k",
      marketingPlan:         "MLS + social + open house",
      estimatedDaysOnMarket: 21,
      estimatedSalePrice:    52_000_000,
      includedServices:      ["staging", "professional photos"],
      validUntil:            Date.now() + 14 * 86_400_000,
      coverLetter:           "I specialize in this zip code",
    });
    expect(proposal.requestId).toBe(req.id);
    expect(proposal.agentName).toBe("Jane Smith");
    expect(proposal.agentBrokerage).toBe("Premier Realty");
    expect(proposal.commissionBps).toBe(250);
    expect(proposal.estimatedSalePrice).toBe(52_000_000);
    expect(proposal.includedServices).toEqual(["staging", "professional photos"]);
  });

  it("assigns status 'Pending'", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await svc.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    expect(p.status).toBe("Pending");
  });

  it("assigns agentId 'local' in mock mode", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await svc.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    expect(p.agentId).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const p = await svc.submitProposal(req.id, {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    expect(typeof p.id).toBe("string");
    expect(p.id.length).toBeGreaterThan(0);
  });

  it("two proposals have distinct ids", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const base = {
      agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
      cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
      estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    };
    const a = await svc.submitProposal(req.id, base);
    const b = await svc.submitProposal(req.id, { ...base, agentName: "Alice" });
    expect(a.id).not.toBe(b.id);
  });

  it("throws when submitting to a non-existent request", async () => {
    await expect(
      svc.submitProposal("ghost-request-id", {
        agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
        cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
        estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
        coverLetter: "",
      })
    ).rejects.toThrow();
  });

  it("throws when submitting to a Cancelled request", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    await svc.cancelBidRequest(req.id);
    await expect(
      svc.submitProposal(req.id, {
        agentName: "Bob", agentBrokerage: "Acme", commissionBps: 300,
        cmaSummary: "Good", marketingPlan: "MLS", estimatedDaysOnMarket: 30,
        estimatedSalePrice: 40_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
        coverLetter: "",
      })
    ).rejects.toThrow();
  });
});

// ─── getProposalsForRequest — sealed-bid logic ────────────────────────────────

describe("listingService.getProposalsForRequest — sealed until deadline", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  afterEach(() => { vi.useRealTimers(); });

  it("returns proposals after the deadline has passed", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000, // 5s in future
    });
    await svc.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z")); // advance past deadline
    const proposals = await svc.getProposalsForRequest(req.id);
    expect(proposals).toHaveLength(1);
  });

  it("returns empty array before the deadline (sealed)", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 99_999_999, // future
    });
    await svc.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    const proposals = await svc.getProposalsForRequest(req.id);
    expect(proposals).toHaveLength(0);
  });

  it("multiple proposals all returned after deadline", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    await svc.submitProposal(req.id, { ...base, agentName: "Jane" });
    await svc.submitProposal(req.id, { ...base, agentName: "Bob" });
    await svc.submitProposal(req.id, { ...base, agentName: "Alice" });
    vi.setSystemTime(new Date("2024-01-02T12:00:00Z")); // advance past deadline
    const proposals = await svc.getProposalsForRequest(req.id);
    expect(proposals).toHaveLength(3);
  });

  it("returns empty array for an unknown requestId", async () => {
    expect(await svc.getProposalsForRequest("unknown-id")).toHaveLength(0);
  });
});

// ─── getMyProposals (agent view) ──────────────────────────────────────────────

describe("listingService.getMyProposals", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  it("starts empty on fresh module", async () => {
    expect(await svc.getMyProposals()).toHaveLength(0);
  });

  it("returns all proposals submitted in this session", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 86_400_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    await svc.submitProposal(req.id, { ...base, agentName: "Jane" });
    await svc.submitProposal(req.id, { ...base, agentName: "Bob" });
    expect(await svc.getMyProposals()).toHaveLength(2);
  });
});

// ─── acceptProposal (stateful mock) ───────────────────────────────────────────

describe("listingService.acceptProposal", () => {
  let svc: typeof listingService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    vi.resetModules();
    const m = await import("@/services/listing");
    svc = m.listingService;
  });

  afterEach(() => { vi.useRealTimers(); });

  it("changes proposal status from Pending to Accepted", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const proposal = await svc.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    await svc.acceptProposal(proposal.id);
    const all = await svc.getMyProposals();
    const updated = all.find(p => p.id === proposal.id);
    expect(updated!.status).toBe("Accepted");
  });

  it("marks the parent BidRequest as Awarded", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const proposal = await svc.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    await svc.acceptProposal(proposal.id);
    const updatedReq = await svc.getBidRequest(req.id);
    expect(updatedReq!.status).toBe("Awarded");
  });

  it("all other proposals on the same request become Rejected", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 5_000,
    });
    const base = {
      agentBrokerage: "Realty", commissionBps: 250, cmaSummary: "comps",
      marketingPlan: "MLS", estimatedDaysOnMarket: 21, estimatedSalePrice: 50_000_000,
      includedServices: [], validUntil: Date.now() + 86_400_000, coverLetter: "",
    };
    const winner   = await svc.submitProposal(req.id, { ...base, agentName: "Jane" });
    const loser1   = await svc.submitProposal(req.id, { ...base, agentName: "Bob" });
    const loser2   = await svc.submitProposal(req.id, { ...base, agentName: "Alice" });

    await svc.acceptProposal(winner.id);

    const all = await svc.getMyProposals();
    const find = (id: string) => all.find(p => p.id === id)!;
    expect(find(winner.id).status).toBe("Accepted");
    expect(find(loser1.id).status).toBe("Rejected");
    expect(find(loser2.id).status).toBe("Rejected");
  });

  it("throws when accepting a non-existent proposal", async () => {
    await expect(svc.acceptProposal("ghost-id")).rejects.toThrow();
  });

  it("awarded request no longer appears in getOpenBidRequests", async () => {
    const req = await svc.createBidRequest({
      propertyId: "p1", targetListDate: Date.now() + 30 * 86_400_000,
      desiredSalePrice: null, notes: "", bidDeadline: Date.now() + 99_999_999,
    });
    const proposal = await svc.submitProposal(req.id, {
      agentName: "Jane", agentBrokerage: "Realty", commissionBps: 250,
      cmaSummary: "comps", marketingPlan: "MLS", estimatedDaysOnMarket: 21,
      estimatedSalePrice: 50_000_000, includedServices: [], validUntil: Date.now() + 86_400_000,
      coverLetter: "",
    });
    await svc.acceptProposal(proposal.id);
    const open = await svc.getOpenBidRequests();
    expect(open.some(r => r.id === req.id)).toBe(false);
  });
});
