/**
 * Mobile v3 — pure logic behind the new screens.
 *
 * SCORE.*   score rubric, decay and hint match the web app
 * UPKEEP.*  recurring due dates, combined schedule, sensor tiles
 * PLAN.*    tiers, limits and the contractor referral fee
 * LEDGER.*  monthly earnings ledger and fee labels
 * CTX.*     agent context has every field the Worker's prompt reads
 * FMT.*     display helpers
 */
import type { Job } from "../../services/jobService";
import type { Property } from "../../services/propertyService";
import { computeBreakdown, computeScore, getAtRisk, rawScore, scoreHint, SCORE_DECAY_FLOOR } from "../../services/scoreService";
import { buildUpkeep, isOverdue, nextDue, summariseSensors, type RecurringService } from "../../services/upkeepService";
import { PLAN_LIMITS, referralFeeCents, isFeeFloored, tierForRole, tierName } from "../../services/planService";
import { buildLedger } from "../../services/contractorService";
import { homeownerContext } from "../../services/agentContext";
import { initials, spendLimitLabel, verificationChip, verificationDocChip, propertyTypeLabel } from "../../services/propertyService";
import { usageMeterLabel } from "../../services/agentService";

const DAY = 86_400_000;
// Local noon, so "days until" doesn't depend on the machine's time zone.
const NOW = new Date(2026, 9, 15, 12).getTime();

function job(over: Partial<Job> = {}): Job {
  return {
    id: "j1", propertyId: "p1", serviceType: "Roofing", description: "Roof repair", amountCents: 100_000,
    completedDate: "2026-09-01", status: "verified", isDiy: false, contractorName: "Bell & Sons",
    verified: true, homeownerSigned: true, contractorSigned: true, ...over,
  };
}

const prop: Property = {
  id: "p1", address: "412 Grandview Ave, Daytona Beach, FL 32118", street: "412 Grandview Ave", city: "Daytona Beach",
  state: "FL", zipCode: "32118", propertyType: "SingleFamily", yearBuilt: 1961, squareFeet: 2140,
  verificationLevel: "Premium", verificationMethod: "DeedRecord", score: 0, scoreGrade: "-",
};

// ── Score ─────────────────────────────────────────────────────────────────────

describe("SCORE — rubric and decay", () => {
  it("SCORE.1 sums verified jobs, value, verification and diversity like the web", () => {
    const jobs = [
      job({ id: "a", serviceType: "Roofing", amountCents: 500_000 }),
      job({ id: "b", serviceType: "HVAC", amountCents: 250_000 }),
      job({ id: "c", serviceType: "HVAC", amountCents: 0, verified: false }),
    ];
    expect(computeBreakdown(jobs, prop)).toEqual({ verifiedJobPts: 8, valuePts: 3, verificationPts: 10, diversityPts: 8 });
    expect(rawScore(jobs, prop)).toBe(29);
  });

  it("SCORE.2 caps each pillar", () => {
    const jobs = Array.from({ length: 15 }, (_, i) => job({ id: `j${i}`, amountCents: 10_000_000 }));
    expect(computeBreakdown(jobs, prop).verifiedJobPts).toBe(40);
    expect(computeBreakdown(jobs, prop).valuePts).toBe(20);
  });

  it("SCORE.3 lapsed warranties, inactivity and overdue tasks reduce the score", () => {
    const old = job({ completedDate: "2025-01-01", warrantyMonths: 6 });
    const raw = rawScore([old], prop);
    // warranty lapsed (−2) + inactivity: ~21 months since, 6 grace → capped at 6, + 2 overdue tasks
    expect(computeScore([old], prop, NOW, 2)).toBe(raw - 2 - 6 - 2);
  });

  it("SCORE.4 decay larger than the score floors at 30", () => {
    const tiny = { ...prop, verificationLevel: "Unverified" as const };
    const j = job({ completedDate: "2024-01-01", warrantyMonths: 1, amountCents: 0 });
    expect(computeScore([j], tiny, NOW, 5)).toBe(SCORE_DECAY_FLOOR);
  });

  it("SCORE.5 hint points at unsigned jobs first", () => {
    const jobs = [job(), job({ id: "x", verified: false }), job({ id: "y", verified: false, serviceType: "HVAC" })];
    expect(scoreHint(jobs, prop, NOW)).toMatch(/^2 jobs are waiting on a signature\. Verifying them moves you to \d+\.$/);
  });

  it("SCORE.6 hint suggests verification when nothing else is pending", () => {
    expect(scoreHint([job()], { ...prop, verificationLevel: "Basic" }, NOW)).toContain("Premium");
  });

  it("SCORE.7 at-risk lists warranties expiring within 30 days", () => {
    const soon = job({ serviceType: "HVAC", completedDate: new Date(NOW - 350 * DAY).toISOString().slice(0, 10), warrantyMonths: 12 });
    const risk = getAtRisk([soon], NOW);
    expect(risk[0]).toMatchObject({ label: "HVAC warranty expires", pts: 2 });
    expect(risk[0].daysRemaining).toBeGreaterThan(0);
  });
});

// ── Upkeep ────────────────────────────────────────────────────────────────────

const svc = (over: Partial<RecurringService> = {}): RecurringService => ({
  id: "s1", serviceType: "GutterCleaning", providerName: "Bell & Sons", providerPhone: null, frequency: "SemiAnnually",
  startDate: "2026-04-01", notes: null, status: "Active", lastVisit: null, ...over,
});

describe("UPKEEP — schedule", () => {
  it("UPKEEP.1 next visit is one period after the last logged visit", () => {
    const due = nextDue(svc({ frequency: "Monthly", lastVisit: "2026-10-01" }));
    expect(new Date(due).getDate()).toBe(31);
  });

  it("UPKEEP.2 with no visits, the start date is due", () => {
    expect(new Date(nextDue(svc({ startDate: "2026-11-02" }))).getMonth()).toBe(10);
  });

  it("UPKEEP.3 combines services and planned tasks, soonest first, with tones", () => {
    const items = buildUpkeep(
      [svc({ startDate: "2026-10-18" }), svc({ id: "s2", serviceType: "LawnCare", frequency: "Weekly", startDate: "2026-10-20" })],
      [{ id: "m1", systemName: "Chimney", taskDescription: "Chimney inspection", plannedYear: 2026, plannedMonth: 8, isCompleted: false }],
      NOW,
    );
    expect(items.map((i) => i.label)).toEqual(["Chimney inspection", "Gutter cleaning", "Lawn maintenance"]);
    expect(items[0]).toMatchObject({ due: "OVERDUE", tone: "red", overdue: true });
    expect(items[1]).toMatchObject({ due: "IN 3 DAYS", tone: "red" });
    expect(items[2]).toMatchObject({ due: "RECURRING", tone: "blue" });
  });

  it("UPKEEP.4 completed tasks and paused services are left out", () => {
    const items = buildUpkeep([svc({ status: "Paused" })], [
      { id: "m1", systemName: "HVAC", taskDescription: "Service", plannedYear: 2026, plannedMonth: 1, isCompleted: true },
    ], NOW);
    expect(items).toEqual([]);
  });

  it("UPKEEP.5 a task is overdue once its month has passed", () => {
    const e = { id: "m", systemName: "", taskDescription: "", plannedYear: 2026, plannedMonth: 9, isCompleted: false };
    expect(isOverdue(e, NOW)).toBe(true);
    expect(isOverdue({ ...e, plannedMonth: 10 }, NOW)).toBe(false);
  });

  it("UPKEEP.6 sensor tiles show the latest alert this week, or all clear", () => {
    const tiles = summariseSensors(
      [
        { id: "d1", name: "Basement water", isActive: true, registeredAt: 0 },
        { id: "d2", name: "Thermostat", isActive: true, registeredAt: 0 },
        { id: "d3", name: "Old", isActive: false, registeredAt: 0 },
      ],
      [{ deviceId: "d2", eventType: "HvacFilterDue", severity: "Warning", timestamp: NOW - 2 * 3_600_000, value: 0, unit: "" }],
      NOW,
    );
    expect(tiles).toEqual([
      { id: "d1", label: "BASEMENT WATER", value: "All clear", note: "No alerts this week", alert: false },
      { id: "d2", label: "THERMOSTAT", value: "Filter due", note: "Warning 2 hrs ago", alert: true },
    ]);
  });
});

// ── Plans and fees ────────────────────────────────────────────────────────────

describe("PLAN — tiers, limits, fees", () => {
  it("PLAN.1 limits match planConstants / CLAUDE.md", () => {
    expect(PLAN_LIMITS.Free).toMatchObject({ propertyLimit: 1, photosPerJob: 5, openQuotes: 3, agentCalls: 10, agentPeriod: "week" });
    expect(PLAN_LIMITS.Pro).toMatchObject({ propertyLimit: 20, photosPerJob: 30, openQuotes: Infinity, agentPeriod: "day" });
    expect(PLAN_LIMITS.ContractorFree.agentCalls).toBe(0);
  });

  it("PLAN.2 referral fee is 3% with a $20 floor, none on Contractor Pro", () => {
    expect(referralFeeCents(124_000, "ContractorFree")).toBe(3_720);
    expect(referralFeeCents(18_000, "ContractorFree")).toBe(2_000);
    expect(isFeeFloored(18_000)).toBe(true);
    expect(referralFeeCents(124_000, "ContractorPro")).toBe(0);
  });

  it("PLAN.3 a contractor's tier is always a contractor tier", () => {
    expect(tierForRole("Free", true)).toBe("ContractorFree");
    expect(tierForRole("ContractorPro", true)).toBe("ContractorPro");
    expect(tierForRole("ContractorPro", false)).toBe("Free");
    expect(tierName("ContractorPro")).toBe("Contractor Pro");
  });

  it("PLAN.4 usage meter wording", () => {
    expect(usageMeterLabel({ used: 4, limit: 10, period: "week" }, true)).toBe("10 AI CALLS A WEEK ON FREE · 6 LEFT");
    expect(usageMeterLabel({ used: 3, limit: 10, period: "day" }, false)).toBe("10 AI CALLS A DAY · 7 LEFT TODAY");
  });
});

// ── Earnings ledger ───────────────────────────────────────────────────────────

describe("LEDGER — this month's winning bids", () => {
  const jobs = [
    job({ id: "a", completedDate: "2026-10-03", amountCents: 124_000, propertyId: "p1" }),
    job({ id: "b", completedDate: "2026-10-09", amountCents: 18_000, serviceType: "Gutters", propertyId: "p2" }),
    job({ id: "c", completedDate: "2026-09-28", amountCents: 50_000 }),
    job({ id: "d", completedDate: "2026-10-10", amountCents: 99_000, verified: false }),
  ];
  const now = new Date("2026-10-15T12:00:00Z");

  it("LEDGER.1 only verified jobs this month, newest first, with fee labels", () => {
    const l = buildLedger(jobs, "ContractorFree", { p1: "412 Grandview Ave" }, now);
    expect(l.rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(l.rows[0]).toMatchObject({ label: "Gutters", feeLabel: "$20.00 FEE · MINIMUM" });
    expect(l.rows[1]).toMatchObject({ label: "Roofing · 412 Grandview Ave", feeLabel: "$37.20 FEE · 3%" });
    expect(l.totalCents).toBe(142_000);
    expect(l.feeTotalCents).toBe(5_720);
    expect(l.month).toBe("OCTOBER");
  });

  it("LEDGER.2 Contractor Pro pays no fees but still sees what Free would have cost", () => {
    const l = buildLedger(jobs, "ContractorPro", {}, now);
    expect(l.feeTotalCents).toBe(0);
    expect(l.rows.every((r) => r.feeLabel === "NO FEE · CONTRACTOR PRO")).toBe(true);
    expect(l.freeFeeCents).toBe(5_720);
  });
});

// ── Agent context ─────────────────────────────────────────────────────────────

describe("CTX — homeowner agent context", () => {
  const ctx = homeownerContext({
    property: prop,
    jobs: [job({ warrantyMonths: 2, completedDate: "2026-09-01" })],
    pendingSignatureJobIds: ["j9"],
    openRequests: [{ id: "q1", serviceType: "GeneralHandyman", description: "Fix fence", urgency: "Low", status: "open" }],
    tier: "Free",
    limits: PLAN_LIMITS.Free,
    now: NOW,
  });

  it("CTX.1 includes every field the Worker's prompt builder requires", () => {
    expect(Array.isArray(ctx.properties)).toBe(true);
    expect(Array.isArray(ctx.recentJobs)).toBe(true);
    expect(Array.isArray(ctx.expiringWarranties)).toBe(true);
    expect(ctx.pendingSignatureJobIds).toEqual(["j9"]);
    expect(ctx.openQuoteCount).toBe(1);
  });

  it("CTX.2 uses display labels and flags warranties expiring within 90 days", () => {
    expect(ctx.openQuoteRequests?.[0].serviceType).toBe("General Handyman");
    expect(ctx.expiringWarranties[0]).toMatchObject({ jobId: "j1", serviceType: "Roofing" });
  });

  it("CTX.3 carries the plan and score", () => {
    expect(ctx.plan).toMatchObject({ tier: "Free", propertyLimit: 1 });
    expect(ctx.score?.breakdown.verificationPts).toBe(10);
    expect(ctx.role).toBe("Homeowner");
  });
});

// ── Display helpers ───────────────────────────────────────────────────────────

describe("FMT — display helpers", () => {
  it("FMT.1 initials", () => {
    expect(initials("Marcus Dean")).toBe("MD");
    expect(initials("dana.mireles@example.com")).toBe("DM");
    expect(initials("")).toBe("?");
  });

  it("FMT.2 spend limits", () => {
    expect(spendLimitLabel(null)).toBe("No limit");
    expect(spendLimitLabel(50_000)).toBe("$500");
    expect(spendLimitLabel(100_000)).toBe("$1,000");
  });

  it("FMT.3 verification chips", () => {
    expect(verificationChip("Premium")).toBe("PREMIUM VERIFIED");
    expect(verificationChip("PendingReview")).toBe("IN REVIEW");
    expect(verificationDocChip("DeedRecord")).toBe("DEED ON FILE");
    expect(verificationDocChip(null)).toBeNull();
    expect(propertyTypeLabel("SingleFamily")).toBe("SINGLE FAMILY");
  });
});
