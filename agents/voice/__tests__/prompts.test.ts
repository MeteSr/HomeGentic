/**
 * prompts.ts — buildSystemPrompt unit tests
 *
 * PROMPT.1   Empty context → includes HomeGentic Assistant identity
 * PROMPT.2   Empty context → key expertise domains present
 * PROMPT.3   Empty context → voice response rules present
 * PROMPT.4   Properties populated → address and ID in output
 * PROMPT.5   Jobs populated → service type and contractor in output
 * PROMPT.6   Expiring warranties → warranty section in output
 * PROMPT.7   Pending signatures → job IDs in output
 * PROMPT.8   Score populated → score value and grade in output
 * PROMPT.9   Score trend → delta embedded in output
 * PROMPT.10  Recommendations → name in output
 * PROMPT.11  Contractor role → contractor persona, not homeowner
 * PROMPT.12  Contractor profile → name and trust score embedded
 */

import { describe, it, expect } from "@jest/globals";
import { buildSystemPrompt } from "../prompts";
import type { AgentContext } from "../types";

const base: AgentContext = {
  properties:             [],
  recentJobs:             [],
  expiringWarranties:     [],
  pendingSignatureJobIds: [],
  openQuoteCount:         0,
};

// ── PROMPT.1 — identity ───────────────────────────────────────────────────────

describe("PROMPT.1 — HomeGentic Assistant identity", () => {
  it("includes the HomeGentic Assistant phrase", () => {
    expect(buildSystemPrompt(base)).toContain("HomeGentic Assistant");
  });
});

// ── PROMPT.2 — expertise domains ─────────────────────────────────────────────

describe("PROMPT.2 — expertise domains", () => {
  const prompt = buildSystemPrompt(base);
  it("mentions HVAC", ()        => { expect(prompt).toContain("HVAC"); });
  it("mentions maintenance", () => { expect(prompt).toMatch(/maintenance/i); });
  it("mentions ROI", ()         => { expect(prompt).toContain("ROI"); });
  it("mentions contractor selection", () => {
    expect(prompt).toMatch(/contractor/i);
  });
});

// ── PROMPT.3 — voice response rules ──────────────────────────────────────────

describe("PROMPT.3 — voice response rules", () => {
  const prompt = buildSystemPrompt(base);
  it("includes the 2–3 sentence cap", () => {
    expect(prompt).toMatch(/2.3 sentences/);
  });
  it("forbids markdown", () => {
    expect(prompt).toMatch(/markdown/i);
  });
  it("forbids bullet points", () => {
    expect(prompt).toMatch(/bullet/i);
  });
});

// ── PROMPT.4 — property section ───────────────────────────────────────────────

describe("PROMPT.4 — property section", () => {
  const ctx: AgentContext = {
    ...base,
    properties: [{
      id: "prop-123", address: "42 Elm St", city: "Austin",
      state: "TX", zipCode: "78701", propertyType: "Single Family",
      yearBuilt: 1998, squareFeet: 1800, verificationLevel: "Basic",
    }],
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes property address",    () => { expect(prompt).toContain("42 Elm St"); });
  it("includes property ID",         () => { expect(prompt).toContain("prop-123"); });
  it("includes city",                () => { expect(prompt).toContain("Austin"); });
  it("includes year built",          () => { expect(prompt).toContain("1998"); });

  it("is absent when properties are empty", () => {
    expect(buildSystemPrompt(base)).not.toContain("registered properties");
  });
});

// ── PROMPT.5 — jobs section ───────────────────────────────────────────────────

describe("PROMPT.5 — jobs section", () => {
  const ctx: AgentContext = {
    ...base,
    recentJobs: [{
      id: "job-99", serviceType: "HVAC Repair",
      description: "Replace compressor", contractorName: "Bob's Heating",
      amount: 85000, date: "2025-03-01", status: "Verified", warrantyMonths: 12,
    }],
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes service type",      () => { expect(prompt).toContain("HVAC Repair"); });
  it("includes contractor name",   () => { expect(prompt).toContain("Bob's Heating"); });
  it("includes job ID",            () => { expect(prompt).toContain("job-99"); });
  it("includes warranty months",   () => { expect(prompt).toContain("warranty: 12 mo"); });

  it("shows DIY for jobs without contractor", () => {
    const diyCtx: AgentContext = {
      ...base,
      recentJobs: [{ id: "j1", serviceType: "Painting", description: "walls", amount: 200, date: "2025-01-01", status: "Verified" }],
    };
    expect(buildSystemPrompt(diyCtx)).toContain("DIY");
  });
});

// ── PROMPT.6 — expiring warranties ───────────────────────────────────────────

describe("PROMPT.6 — expiring warranties", () => {
  const ctx: AgentContext = {
    ...base,
    expiringWarranties: [{
      jobId: "job-5", serviceType: "Roof",
      expiryDate: "2025-06-01", daysRemaining: 45,
    }],
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes the warranty job ID",    () => { expect(prompt).toContain("job-5"); });
  it("includes days remaining",         () => { expect(prompt).toContain("45 days"); });

  it("is absent when no warranties expiring", () => {
    expect(buildSystemPrompt(base)).not.toContain("Warranties expiring");
  });
});

// ── PROMPT.7 — pending signatures ────────────────────────────────────────────

describe("PROMPT.7 — pending signatures", () => {
  const ctx: AgentContext = {
    ...base,
    pendingSignatureJobIds: ["job-77", "job-88"],
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes both pending job IDs", () => {
    expect(prompt).toContain("job-77");
    expect(prompt).toContain("job-88");
  });
});

// ── PROMPT.8 — score section ──────────────────────────────────────────────────

describe("PROMPT.8 — score section", () => {
  const ctx: AgentContext = {
    ...base,
    score: {
      score: 72, grade: "B",
      breakdown: { verifiedJobPts: 25, valuePts: 15, verificationPts: 12, diversityPts: 20 },
      recentEvents: [{ label: "Verified job added", pts: 5, category: "job" }],
      nextActions:  ["Add a photo to your last job"],
    },
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes score value and max",   () => { expect(prompt).toContain("72/100"); });
  it("includes grade",                 () => { expect(prompt).toContain("grade B"); });
  it("includes a next action tip",     () => { expect(prompt).toContain("Add a photo"); });
  it("includes a recent score event",  () => { expect(prompt).toContain("Verified job added"); });
});

// ── PROMPT.9 — score trend ────────────────────────────────────────────────────

describe("PROMPT.9 — score trend", () => {
  const ctx: AgentContext = {
    ...base,
    score: {
      score: 72, grade: "B",
      breakdown: { verifiedJobPts: 25, valuePts: 15, verificationPts: 12, diversityPts: 20 },
      recentEvents: [], nextActions: [],
    },
    scoreTrend: {
      delta: 5, trend: "up", previousScore: 67, milestoneCoaching: null,
    },
  };

  it("includes the positive delta", () => {
    expect(buildSystemPrompt(ctx)).toContain("+5");
  });

  it("is absent when delta is zero", () => {
    const flatCtx: AgentContext = {
      ...ctx,
      scoreTrend: { delta: 0, trend: "flat", previousScore: 72, milestoneCoaching: null },
    };
    expect(buildSystemPrompt(flatCtx)).not.toMatch(/Score trend:/);
  });
});

// ── PROMPT.10 — recommendations ──────────────────────────────────────────────

describe("PROMPT.10 — top recommendations", () => {
  const ctx: AgentContext = {
    ...base,
    topRecommendations: [{
      name: "Attic Insulation", priority: "High",
      estimatedCostDollars: 3500, estimatedRoiPercent: 120,
      rationale: "Most impactful for energy bills",
    }],
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes recommendation name",     () => { expect(prompt).toContain("Attic Insulation"); });
  it("includes cost estimate",           () => { expect(prompt).toContain("3,500"); });
  it("includes ROI percent",             () => { expect(prompt).toContain("120%"); });
});

// ── PROMPT.11 — Contractor role switches persona ──────────────────────────────

describe("PROMPT.11 — Contractor role returns contractor persona", () => {
  const ctx: AgentContext = { ...base, role: "Contractor" };
  const prompt = buildSystemPrompt(ctx);

  it("does NOT include the homeowner identity phrase", () => {
    expect(prompt).not.toContain("HomeGentic Assistant — a knowledgeable");
  });
  it("includes the Contractor Assistant identity", () => {
    expect(prompt).toContain("Contractor Assistant");
  });
  it("mentions leads", () => {
    expect(prompt).toMatch(/leads/i);
  });
});

// ── PROMPT.12 — Contractor profile embedded ───────────────────────────────────

describe("PROMPT.12 — Contractor profile embedded", () => {
  const ctx: AgentContext = {
    ...base,
    role: "Contractor",
    contractorProfile: {
      name:         "FastFix LLC",
      trustScore:   88,
      jobsCompleted: 47,
      isVerified:   true,
      specialties:  ["Plumbing", "HVAC"],
    },
  };
  const prompt = buildSystemPrompt(ctx);

  it("includes contractor name",    () => { expect(prompt).toContain("FastFix LLC"); });
  it("includes trust score",        () => { expect(prompt).toContain("88/100"); });
  it("includes verified badge",     () => { expect(prompt).toContain("Verified"); });
  it("includes specialties",        () => { expect(prompt).toContain("Plumbing"); });
});
