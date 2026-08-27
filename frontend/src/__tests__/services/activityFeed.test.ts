/**
 * Unit tests for deriveEvents (activityFeed.ts)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { deriveEvents } from "@/services/activityFeed";
import type { Job } from "@/services/job";
import type { QuoteRequest } from "@/services/quote";
import type { BillRecord } from "@/services/billService";

// Pin Date.now so warranty/timestamp logic is deterministic
const NOW_MS = new Date("2024-07-01T00:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1",
    propertyId: "prop-1",
    serviceType: "HVAC",
    date: "2024-01-01",
    amount: 50000,
    isDiy: false,
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    createdAt: NOW_MS - 10_000,
    ...overrides,
  } as Job;
}

function makeQuote(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "q1",
    propertyId: "prop-1",
    status: "open",
    serviceType: "Roofing",
    createdAt: NOW_MS,
    ...overrides,
  } as any;
}

function makeBill(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: "bill-1",
    propertyId: "prop-1",
    homeowner: "owner-1",
    billType: "Electric",
    provider: "Duke Energy",
    periodStart: "2024-06-01",
    periodEnd: "2024-06-30",
    amountCents: 12000,
    uploadedAt: NOW_MS,
    anomalyFlag: false,
    ...overrides,
  };
}

// ── empty inputs ──────────────────────────────────────────────────────────────

describe("deriveEvents — empty inputs", () => {
  it("returns empty array when all inputs are empty", () => {
    const events = deriveEvents([], [], [], []);
    expect(events).toHaveLength(0);
  });
});

// ── pending_verification events ───────────────────────────────────────────────

describe("deriveEvents — pending_verification", () => {
  it("emits a pending_verification event for PendingReview properties", () => {
    const property = {
      id: "prop-1",
      address: "123 Main St",
      verificationLevel: "PendingReview",
      createdAt: BigInt(NOW_MS) * BigInt(1_000_000),
    };
    const events = deriveEvents([property], [], [], []);
    const pvEvent = events.find(e => e.type === "pending_verification");
    expect(pvEvent).toBeDefined();
    expect(pvEvent!.title).toBe("Verification pending");
    expect(pvEvent!.href).toContain("prop-1");
  });

  it("does not emit pending_verification for Unverified properties", () => {
    const property = { id: "p2", address: "456 Oak", verificationLevel: "Unverified", createdAt: BigInt(0) };
    const events = deriveEvents([property], [], [], []);
    expect(events.find(e => e.type === "pending_verification")).toBeUndefined();
  });
});

// ── job_pending_sig events ────────────────────────────────────────────────────

describe("deriveEvents — job_pending_sig", () => {
  it("emits job_pending_sig for unsigned jobs", () => {
    const job = makeJob({ verified: false, homeownerSigned: false });
    const events = deriveEvents([], [job], [], []);
    expect(events.find(e => e.type === "job_pending_sig")).toBeDefined();
  });

  it("does not emit job_pending_sig for already-signed jobs", () => {
    const job = makeJob({ verified: true, homeownerSigned: true });
    const events = deriveEvents([], [job], [], []);
    expect(events.find(e => e.type === "job_pending_sig")).toBeUndefined();
  });
});

// ── open_quote events ─────────────────────────────────────────────────────────

describe("deriveEvents — open_quote", () => {
  it("emits open_quote when at least one quote is open", () => {
    const quote = makeQuote({ status: "open" });
    const events = deriveEvents([], [], [quote], []);
    const qEvent = events.find(e => e.type === "open_quote");
    expect(qEvent).toBeDefined();
    expect(qEvent!.title).toContain("1 open quote");
  });

  it("does not emit open_quote when all quotes are closed", () => {
    const quote = makeQuote({ status: "completed" as any });
    const events = deriveEvents([], [], [quote], []);
    expect(events.find(e => e.type === "open_quote")).toBeUndefined();
  });
});

// ── bill_anomaly events ───────────────────────────────────────────────────────

describe("deriveEvents — bill_anomaly", () => {
  it("emits bill_anomaly for bills with anomalyFlag true", () => {
    const bill = makeBill({ anomalyFlag: true, anomalyReason: "30% spike detected" });
    const events = deriveEvents([], [], [], [bill]);
    const anomaly = events.find(e => e.type === "bill_anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.detail).toBe("30% spike detected");
  });

  it("does not emit bill_anomaly for normal bills", () => {
    const bill = makeBill({ anomalyFlag: false });
    const events = deriveEvents([], [], [], [bill]);
    expect(events.find(e => e.type === "bill_anomaly")).toBeUndefined();
  });

  it("also emits insurance_trigger for Water bill anomalies", () => {
    const bill = makeBill({ billType: "Water", anomalyFlag: true });
    const events = deriveEvents([], [], [], [bill]);
    expect(events.find(e => e.type === "insurance_trigger")).toBeDefined();
  });

  it("does not emit insurance_trigger for non-Water anomalies", () => {
    const bill = makeBill({ billType: "Electric", anomalyFlag: true });
    const events = deriveEvents([], [], [], [bill]);
    expect(events.find(e => e.type === "insurance_trigger")).toBeUndefined();
  });
});

// ── result ordering and cap ───────────────────────────────────────────────────

describe("deriveEvents — ordering and limit", () => {
  it("returns results sorted by timestamp descending", () => {
    const oldBill = makeBill({ id: "b1", anomalyFlag: true, uploadedAt: NOW_MS - 100_000 });
    const newBill = makeBill({ id: "b2", anomalyFlag: true, uploadedAt: NOW_MS });
    const events = deriveEvents([], [], [], [oldBill, newBill]);
    // Most recent first
    expect(events[0].timestamp).toBeGreaterThanOrEqual(events[1].timestamp);
  });

  it("caps result at 20 events", () => {
    // Create 25 properties all pending review to generate many events
    const properties = Array.from({ length: 25 }, (_, i) => ({
      id: `prop-${i}`,
      address: `${i} Main St`,
      verificationLevel: "PendingReview",
      createdAt: BigInt(NOW_MS) * BigInt(1_000_000),
    }));
    const events = deriveEvents(properties, [], [], []);
    expect(events.length).toBeLessThanOrEqual(20);
  });
});
