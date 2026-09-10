import { describe, it, expect } from "vitest";
import { getReEngagementPrompts } from "@/services/reEngagementService";
import type { Job } from "@/services/job";

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW_MS = new Date("2026-03-29").getTime();

function makeJob(overrides: Partial<Job> & { id: string }): Job {
  return {
    id:             overrides.id,
    propertyId:     overrides.propertyId     ?? "PROP_1",
    serviceType:    overrides.serviceType    ?? "HVAC",
    contractorName: overrides.contractorName,
    homeowner:      overrides.homeowner      ?? "owner",
    date:           overrides.date           ?? "2025-04-01",
    description:    overrides.description    ?? "",
    amount:         overrides.amount         ?? 0,
    status:         overrides.status         ?? "verified",
    verified:       overrides.verified       ?? true,
    isDiy:          overrides.isDiy          ?? false,
    homeownerSigned: overrides.homeownerSigned ?? true,
    contractorSigned: overrides.contractorSigned ?? true,
    photos:         overrides.photos         ?? [],
    createdAt:      overrides.createdAt      ?? NOW_MS - 1000,
  };
}

// 11 months ago from 2026-03-29
const ELEVEN_MONTHS_AGO = "2025-04-29";
// 10 months ago
const TEN_MONTHS_AGO    = "2025-05-29";
// 13 months ago
const THIRTEEN_MONTHS_AGO = "2025-02-28";
// 8 months ago — too recent
const EIGHT_MONTHS_AGO  = "2025-07-29";
// 14 months ago — too old
const FOURTEEN_MONTHS_AGO = "2025-01-29";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getReEngagementPrompts", () => {

  // ── Basic eligibility ────────────────────────────────────────────────────────

  it("returns a prompt when a verified contractor job is 10–13 months old", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: ELEVEN_MONTHS_AGO })];
    const prompts = getReEngagementPrompts(jobs, NOW_MS);
    expect(prompts).toHaveLength(1);
  });

  it("returns no prompts when the job is only 8 months old (too recent)", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: EIGHT_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(0);
  });

  it("returns no prompts when the job is 14 months old (too stale)", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: FOURTEEN_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(0);
  });

  it("returns no prompt for a DIY job (no contractor to re-engage)", () => {
    const jobs = [makeJob({ id: "J1", contractorName: undefined, isDiy: true, date: ELEVEN_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(0);
  });

  it("returns no prompt for an unverified job", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", verified: false, status: "completed", date: ELEVEN_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(0);
  });

  it("accepts jobs at exactly 10 months (lower bound inclusive)", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: TEN_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(1);
  });

  it("accepts jobs at exactly 13 months (upper bound inclusive)", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: THIRTEEN_MONTHS_AGO })];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(1);
  });

  // ── Prompt shape ──────────────────────────────────────────────────────────────

  it("prompt includes contractorName, serviceType, jobId, monthsSince, message", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air Services", serviceType: "HVAC", date: ELEVEN_MONTHS_AGO })];
    const [p] = getReEngagementPrompts(jobs, NOW_MS);
    expect(p.contractorName).toBe("Cool Air Services");
    expect(p.serviceType).toBe("HVAC");
    expect(p.jobId).toBe("J1");
    expect(typeof p.monthsSince).toBe("number");
    expect(p.monthsSince).toBeGreaterThanOrEqual(10);
    expect(p.monthsSince).toBeLessThanOrEqual(13);
    expect(typeof p.message).toBe("string");
    expect(p.message.length).toBeGreaterThan(0);
  });

  it("message mentions the contractor name", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air Services", date: ELEVEN_MONTHS_AGO })];
    const [p] = getReEngagementPrompts(jobs, NOW_MS);
    expect(p.message).toContain("Cool Air Services");
  });

  it("message mentions the service type", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Fix-It Pro", serviceType: "Plumbing", date: ELEVEN_MONTHS_AGO })];
    const [p] = getReEngagementPrompts(jobs, NOW_MS);
    expect(p.message).toContain("Plumbing");
  });

  // ── One prompt per service type ───────────────────────────────────────────────

  it("returns one prompt per eligible service type, not one per job", () => {
    const jobs = [
      makeJob({ id: "J1", contractorName: "Cool Air", serviceType: "HVAC",    date: ELEVEN_MONTHS_AGO }),
      makeJob({ id: "J2", contractorName: "Roofers",  serviceType: "Roofing", date: ELEVEN_MONTHS_AGO }),
    ];
    const prompts = getReEngagementPrompts(jobs, NOW_MS);
    expect(prompts).toHaveLength(2);
    const types = prompts.map((p) => p.serviceType);
    expect(types).toContain("HVAC");
    expect(types).toContain("Roofing");
  });

  it("uses the most recent job per service type when multiple exist", () => {
    const jobs = [
      makeJob({ id: "J_OLD", contractorName: "Old Co",  serviceType: "HVAC", date: THIRTEEN_MONTHS_AGO }),
      makeJob({ id: "J_NEW", contractorName: "New Co",  serviceType: "HVAC", date: ELEVEN_MONTHS_AGO }),
    ];
    const [p] = getReEngagementPrompts(jobs, NOW_MS);
    // Most recent is J_NEW — it's in window; J_OLD is further but second-most-recent
    expect(p.jobId).toBe("J_NEW");
    expect(p.contractorName).toBe("New Co");
  });

  it("ignores older jobs for same service type when the most recent is outside window", () => {
    // Most recent HVAC job is 5 months ago (too recent) — no prompt
    const jobs = [
      makeJob({ id: "J_OLD", contractorName: "Old Co", serviceType: "HVAC", date: ELEVEN_MONTHS_AGO }),
      makeJob({ id: "J_NEW", contractorName: "New Co", serviceType: "HVAC", date: "2025-10-29" }), // ~5 months ago
    ];
    expect(getReEngagementPrompts(jobs, NOW_MS)).toHaveLength(0);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it("returns empty array for empty job list", () => {
    expect(getReEngagementPrompts([], NOW_MS)).toHaveLength(0);
  });

  it("defaults nowMs to Date.now() when not provided (smoke test)", () => {
    // Should not throw
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: ELEVEN_MONTHS_AGO })];
    expect(() => getReEngagementPrompts(jobs)).not.toThrow();
  });

  it("monthsSince is an integer", () => {
    const jobs = [makeJob({ id: "J1", contractorName: "Cool Air", date: ELEVEN_MONTHS_AGO })];
    const [p] = getReEngagementPrompts(jobs, NOW_MS);
    expect(Number.isInteger(p.monthsSince)).toBe(true);
  });

  it("multiple service types each get independent prompts", () => {
    const jobs = [
      makeJob({ id: "J1", contractorName: "Air Inc",  serviceType: "HVAC",      date: ELEVEN_MONTHS_AGO }),
      makeJob({ id: "J2", contractorName: "Pipe Pro", serviceType: "Plumbing",  date: TEN_MONTHS_AGO }),
      makeJob({ id: "J3", contractorName: "Roof Co",  serviceType: "Roofing",   date: EIGHT_MONTHS_AGO }), // too recent
    ];
    const prompts = getReEngagementPrompts(jobs, NOW_MS);
    expect(prompts).toHaveLength(2);
  });
});
