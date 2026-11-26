/**
 * prepare_home_task: the read-only first step of a multi-step assistant task.
 * It gathers the facts for one home in the browser and suggests the writes,
 * so the model can propose one plan on its next turn. Nothing here saves
 * anything.
 *
 *  AT.1 storm prep: emergency card gaps (never the guide's contents), roof and
 *       gutter state, and suggested schedule/quote steps
 *  AT.2 insurance claim: policy, open claims and their photos, earlier work for
 *       the trade, and a suggested claim record and repair quote (drafts only)
 *  AT.3 closing handoff: whether the report link is current, permits and lien
 *       waivers as recorded, unsigned jobs, and a buyer-only link; the transfer
 *       stays a human step
 *  AT.4 prepareHomeTask reads the services for the named home only and says
 *       which reads failed instead of guessing
 *  AT.5 insurance renewal: the policy on file, updates insurers ask about, the
 *       roof, saved insurance papers and (Florida) inspection readiness, with
 *       inspection or roof quote requests; HomeGentic never contacts an
 *       insurer or quotes a premium
 *  AT.6 find a contractor: earlier work of that kind at the home, directory
 *       matches (not recommendations), a price range with its basis, and one
 *       quote request unless one is already open or the plan limit is reached
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/property", () => ({ propertyService: { getMyProperties: vi.fn() } }));
vi.mock("@/services/job", () => ({ jobService: { getByProperty: vi.fn(), getCloseouts: vi.fn() } }));
vi.mock("@/services/houseGuide", () => ({
  houseGuideService: { get: vi.fn() },
  isBaselinePhoto: (p: { jobId: string; propertyId: string }) => p.jobId === `baseline_${p.propertyId}`,
}));
vi.mock("@/services/insurancePolicy", async (orig) => ({
  ...(await orig<typeof import("@/services/insurancePolicy")>()),
  insurancePolicyService: { get: vi.fn() },
}));
vi.mock("@/services/insuranceClaims", async (orig) => ({
  ...(await orig<typeof import("@/services/insuranceClaims")>()),
  insuranceClaimService: { list: vi.fn() },
}));
vi.mock("@/services/photo", () => ({ photoService: { getByJob: vi.fn(), listByJob: vi.fn() } }));
vi.mock("@/services/maintenance", () => ({
  maintenanceService: { getScheduleByProperty: vi.fn() },
  predictMaintenance: vi.fn(),
}));
vi.mock("@/services/inventory", () => ({ inventoryService: { list: vi.fn() }, inventoryTotalCents: () => 0 }));
vi.mock("@/services/quote", () => ({ quoteService: { getRequests: vi.fn() } }));
vi.mock("@/services/report", () => ({ reportService: { listShareLinks: vi.fn() } }));
vi.mock("@/services/contractor", () => ({ contractorService: { search: vi.fn() } }));
vi.mock("@/services/payment", () => ({ paymentService: { getMySubscription: vi.fn() } }));
vi.mock("@/services/priceBenchmark", async (orig) => ({
  ...(await orig<typeof import("@/services/priceBenchmark")>()),
  getPriceBenchmark: vi.fn(),
}));

import {
  stormPrepFacts,
  claimPacketFacts,
  closingHandoffFacts,
  insuranceRenewalFacts,
  contractorSourcingFacts,
  prepareHomeTask,
} from "@/services/assistantTasks";
import { contractorService } from "@/services/contractor";
import { paymentService } from "@/services/payment";
import { getPriceBenchmark } from "@/services/priceBenchmark";
import type { ReadinessItem } from "@/services/insuranceReadiness";
import { propertyService } from "@/services/property";
import { jobService, type Job } from "@/services/job";
import { houseGuideService } from "@/services/houseGuide";
import { insurancePolicyService, type InsurancePolicy } from "@/services/insurancePolicy";
import { insuranceClaimService, type InsuranceClaim } from "@/services/insuranceClaims";
import { photoService } from "@/services/photo";
import { maintenanceService, predictMaintenance } from "@/services/maintenance";
import { inventoryService } from "@/services/inventory";
import { quoteService } from "@/services/quote";
import { reportService, type ShareLink } from "@/services/report";

const NOW = new Date("2026-05-10T12:00:00Z");
const home = { id: "P1", address: "12 Oak St", city: "Tampa", state: "FL", zipCode: "33601", yearBuilt: 2001 };

function job(over: Partial<Job>): Job {
  return {
    id: "J1",
    propertyId: "P1",
    homeowner: "me",
    serviceType: "Roofing",
    amount: 100_000,
    date: "2020-01-01",
    description: "work",
    isDiy: false,
    status: "verified",
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    photos: [],
    createdAt: Date.parse("2020-01-02"),
    contractorName: "Acme",
    ...over,
  } as Job;
}

const policy: InsurancePolicy = {
  carrier: "Gulf Mutual",
  policyNumber: "HO-123",
  renewalDate: "2026-12-01",
  coverageA: 400_000,
  hurricaneDeductible: { kind: "percent", percent: 2 },
};

const guide = {
  waterShutoff: "Front yard by the meter",
  gasShutoff: "",
  electricPanel: "Garage",
  alarm: "Code 4512",
  contacts: [{ name: "Gulf Mutual claims", role: "Insurance claims", phone: "800-555-0100" }],
  photoIds: [],
};

describe("AT.1 — storm prep", () => {
  const base = {
    property: home,
    jobs: [] as Job[],
    guide,
    policy,
    baselinePhotos: [],
    schedule: [],
    roof: { urgency: "Good" as const, yearsRemaining: 12 },
    openQuoteServiceTypes: [] as string[],
    now: NOW,
  };

  it("lists what the emergency card is missing, never what the guide says", () => {
    const f = stormPrepFacts(base);
    expect(f.facts.emergencyCardMissing).toEqual(
      expect.arrayContaining(["Where the gas shut-off is", "Emergency contacts"]),
    );
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/4512|Front yard|800-555-0100|HO-123/);
    expect(f.gaps.join(" ")).toMatch(/emergency card/i);
  });

  it("knows a Florida home in May is in a hurricane state, and works out the deductible", () => {
    const f = stormPrepFacts(base);
    expect(f.facts.hurricaneZone).toBe(true);
    expect(f.facts.hurricaneDeductibleDollars).toBe(8_000);
  });

  it("suggests scheduling gutter cleaning when none is on record for a year", () => {
    const f = stormPrepFacts({ ...base, jobs: [job({ id: "G", serviceType: "Gutters", date: "2025-01-15" })] });
    const step = f.suggestedSteps.find((s) => s.tool === "schedule_maintenance_task");
    expect(step?.input).toMatchObject({
      property_id: "P1",
      system_name: "Gutters",
      planned_year: 2026,
      planned_month: 6,
    });
  });

  it("doesn't suggest gutters when they were cleaned recently or are already scheduled", () => {
    expect(
      stormPrepFacts({ ...base, jobs: [job({ serviceType: "Gutters", date: "2026-03-01" })] }).suggestedSteps.some(
        (s) => s.input.system_name === "Gutters",
      ),
    ).toBe(false);
    const scheduled = [
      {
        id: "S",
        propertyId: "P1",
        systemName: "Gutters",
        taskDescription: "Clean",
        plannedYear: 2026,
        isCompleted: false,
        createdAt: 0,
      },
    ];
    expect(
      stormPrepFacts({ ...base, schedule: scheduled }).suggestedSteps.some((s) => s.input.system_name === "Gutters"),
    ).toBe(false);
  });

  it("suggests a roofing quote for a roof near the end of its life, unless one is already open", () => {
    const worn = { ...base, roof: { urgency: "Soon" as const, yearsRemaining: 1 } };
    const q = stormPrepFacts(worn).suggestedSteps.find((s) => s.tool === "create_quote_request");
    expect(q?.input).toMatchObject({ property_id: "P1", service_type: "Roofing", urgency: "Medium" });
    expect(
      stormPrepFacts({ ...worn, openQuoteServiceTypes: ["Roofing"] }).suggestedSteps.some(
        (s) => s.tool === "create_quote_request",
      ),
    ).toBe(false);
  });

  it("points to the card's own checklist and wraps December into January", () => {
    const f = stormPrepFacts({ ...base, now: new Date("2026-12-05T00:00:00Z") });
    expect(f.links).toContainEqual(expect.objectContaining({ path: "/properties/P1/emergency" }));
    const g = f.suggestedSteps.find((s) => s.input.system_name === "Gutters");
    expect(g?.input).toMatchObject({ planned_year: 2027, planned_month: 1 });
  });
});

describe("AT.2 — insurance claim packet", () => {
  const claim: InsuranceClaim = {
    id: "C1",
    propertyId: "P1",
    title: "Roof leak",
    dateOfLoss: "2026-04-30",
    cause: "Wind or hurricane",
    description: "",
    claimNumber: "",
    adjusterName: "",
    adjusterContact: "",
    status: "open",
    log: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const base = {
    property: home,
    policy,
    claims: [] as InsuranceClaim[],
    claimPhotoCounts: {} as Record<string, number>,
    jobs: [
      job({ id: "R1", serviceType: "Roofing", date: "2019-06-01", permitNumber: "BP-9" }),
      job({ id: "H1", serviceType: "HVAC" }),
    ],
    inventory: { items: 0, valueCents: 0 },
    cause: "Wind or hurricane",
    dateOfLoss: "2026-05-08",
    damage: "Shingles off the west slope",
    now: NOW,
  };

  it("gathers the policy, earlier work for the trade, and the inventory", () => {
    const f = claimPacketFacts(base);
    expect(f.facts.policy).toMatchObject({
      carrier: "Gulf Mutual",
      hurricaneDeductibleDollars: 8_000,
      hasPolicyNumber: true,
    });
    expect((f.facts.relatedJobs as any[]).map((j) => j.serviceType)).toEqual(["Roofing"]);
    expect(f.gaps.join(" ")).toMatch(/inventory/i);
  });

  it("suggests a claim record and a repair quote for a new loss", () => {
    const f = claimPacketFacts(base);
    expect(f.suggestedSteps.map((s) => s.tool)).toEqual(["create_insurance_claim", "create_quote_request"]);
    expect(f.suggestedSteps[0].input).toMatchObject({
      property_id: "P1",
      date_of_loss: "2026-05-08",
      cause: "Wind or hurricane",
      description: "Shingles off the west slope",
    });
    expect(f.suggestedSteps[1].input).toMatchObject({ service_type: "Roofing", urgency: "High" });
  });

  it("uses an open claim instead of starting another, and flags it has no photos", () => {
    const f = claimPacketFacts({ ...base, claims: [claim], dateOfLoss: undefined });
    expect(f.suggestedSteps.some((s) => s.tool === "create_insurance_claim")).toBe(false);
    expect(f.gaps.join(" ")).toMatch(/photos/i);
  });

  it("asks for the date of loss rather than inventing one", () => {
    const f = claimPacketFacts({ ...base, dateOfLoss: undefined });
    expect(f.suggestedSteps.some((s) => s.tool === "create_insurance_claim")).toBe(false);
    expect(f.gaps.join(" ")).toMatch(/date of loss/i);
  });

  it("says filing stays with the user", () => {
    expect(claimPacketFacts(base).humanSteps.join(" ")).toMatch(/insurer/i);
    expect(JSON.stringify(claimPacketFacts(base))).not.toMatch(/HO-123/);
  });

  it("notes a missing policy", () => {
    expect(claimPacketFacts({ ...base, policy: null }).gaps.join(" ")).toMatch(/policy/i);
  });
});

describe("AT.3 — closing handoff", () => {
  const link = (over: object): ShareLink => ({
    token: "T",
    snapshotId: "S",
    propertyId: "P1",
    createdBy: "me",
    expiresAt: null,
    visibility: "BuyerOnly" as const,
    viewCount: 0,
    isActive: true,
    createdAt: Date.parse("2026-01-01"),
    ...over,
  });
  const jobs = [
    job({ id: "J1", createdAt: Date.parse("2025-06-01") }),
    job({
      id: "J2",
      serviceType: "Electrical",
      amount: 600_000,
      permitNumber: "E-77",
      createdAt: Date.parse("2026-03-01"),
    }),
    job({
      id: "J3",
      serviceType: "HVAC",
      amount: 900_000,
      verified: false,
      contractorSigned: false,
      status: "completed",
      createdAt: Date.parse("2026-04-01"),
    }),
  ];
  const closeouts = [{ jobId: "J1", permitStatus: "open" as const, papers: [] }];

  it("says the report link is out of date when jobs were added after it", () => {
    const f = closingHandoffFacts({ property: home, jobs, closeouts, shareLinks: [link({})], now: NOW });
    expect(f.facts.report).toMatchObject({ current: false, jobsSinceLatestLink: 2 });
    expect(f.suggestedSteps).toEqual([
      expect.objectContaining({
        tool: "share_report",
        input: { property_id: "P1", visibility: "BuyerOnly", expiry_days: 90 },
      }),
    ]);
  });

  it("lists permits and lien waivers as recorded, without calling the home lien-free", () => {
    const f = closingHandoffFacts({ property: home, jobs, closeouts, shareLinks: [], now: NOW });
    expect((f.facts.permits as any).open.map((p: any) => p.jobId)).toEqual(["J1"]);
    expect((f.facts.permits as any).unrecorded.map((p: any) => p.jobId)).toEqual(["J2"]);
    expect((f.facts.lienWaivers as any).missing.map((p: any) => p.jobId)).toEqual(["J2", "J3"]);
    expect((f.facts.unsignedJobs as any[]).map((j) => j.jobId)).toEqual(["J3"]);
    expect(JSON.stringify(f)).not.toMatch(/lien-free|permits are closed/i);
  });

  it("stays small enough for one assistant turn on a home with a long history", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      job({
        id: `J${i}`,
        amount: 900_000,
        permitNumber: `P-${i}`,
        verified: false,
        description: "x".repeat(300),
        createdAt: Date.parse("2026-02-01"),
      }),
    );
    const f = closingHandoffFacts({ property: home, jobs: many, closeouts: [], shareLinks: [], now: NOW });
    expect(JSON.stringify(f).length).toBeLessThan(6_000);
    expect((f.facts.permits as any).unrecordedCount).toBe(120);
    expect((f.facts.lienWaivers as any).missingCount).toBe(120);
  });

  it("keeps the transfer a human step", () => {
    const f = closingHandoffFacts({ property: home, jobs: [], closeouts: [], shareLinks: [], now: NOW });
    expect(f.humanSteps.join(" ")).toMatch(/transfer/i);
  });

  it("suggests nothing when a buyer link is newer than every job", () => {
    const f = closingHandoffFacts({
      property: home,
      jobs,
      closeouts: [],
      shareLinks: [link({ createdAt: Date.parse("2026-05-01") })],
      now: NOW,
    });
    expect(f.facts.report).toMatchObject({ current: true });
    expect(f.suggestedSteps).toEqual([]);
  });
});

describe("AT.4 — prepareHomeTask", () => {
  beforeEach(() => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([home as any]);
    vi.mocked(jobService.getByProperty).mockResolvedValue([]);
    vi.mocked(jobService.getCloseouts).mockResolvedValue([]);
    vi.mocked(houseGuideService.get).mockResolvedValue(null);
    vi.mocked(insurancePolicyService.get).mockResolvedValue(policy);
    vi.mocked(insuranceClaimService.list).mockResolvedValue([]);
    vi.mocked(photoService.getByJob).mockResolvedValue([]);
    vi.mocked(maintenanceService.getScheduleByProperty).mockResolvedValue([]);
    vi.mocked(predictMaintenance).mockReturnValue({
      systemPredictions: [{ systemName: "Roofing", urgency: "Good", yearsRemaining: 10 }],
    } as any);
    vi.mocked(inventoryService.list).mockResolvedValue([]);
    vi.mocked(quoteService.getRequests).mockResolvedValue([]);
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);
    vi.mocked(photoService.listByJob).mockResolvedValue([]);
    vi.mocked(contractorService.search).mockResolvedValue([]);
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro", expiresAt: null, cancelledAt: null } as any);
    vi.mocked(getPriceBenchmark).mockResolvedValue(null);
  });

  it("refuses an unknown task or a home the user doesn't have", async () => {
    expect(await prepareHomeTask({ task: "sell", property_id: "P1" })).toMatchObject({ success: false });
    expect(await prepareHomeTask({ task: "storm_prep", property_id: "NOPE" })).toMatchObject({
      success: false,
      error: expect.stringMatching(/home/i),
    });
  });

  it("gathers storm prep for the named home", async () => {
    const r = await prepareHomeTask({ task: "storm_prep", property_id: "P1" });
    expect(r.success).toBe(true);
    expect(houseGuideService.get).toHaveBeenCalledWith("P1");
    expect(r.data).toMatchObject({ task: "storm_prep", propertyId: "P1" });
    expect(typeof r.data!.summary).toBe("string");
  });

  it("says which reads failed instead of guessing", async () => {
    vi.mocked(insurancePolicyService.get).mockRejectedValue(new Error("down"));
    const r = await prepareHomeTask({
      task: "insurance_claim",
      property_id: "P1",
      date_of_loss: "2026-05-08",
      cause: "Hail",
    });
    expect(r.success).toBe(true);
    expect(r.data!.couldNotRead as string[]).toContain("insurance policy");
  });

  it("gathers the closing check from report links and close-outs", async () => {
    const r = await prepareHomeTask({ task: "closing_handoff", property_id: "P1" });
    expect(reportService.listShareLinks).toHaveBeenCalledWith("P1");
    expect(jobService.getCloseouts).toHaveBeenCalledWith(["P1"]);
    expect(r.data).toMatchObject({ task: "closing_handoff" });
  });
});

describe("AT.4 — prepareHomeTask, renewal and contractor tasks", () => {
  beforeEach(() => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([home as any]);
    vi.mocked(jobService.getByProperty).mockResolvedValue([]);
    vi.mocked(insurancePolicyService.get).mockResolvedValue(policy);
    vi.mocked(insuranceClaimService.list).mockResolvedValue([]);
    vi.mocked(photoService.listByJob).mockResolvedValue([]);
    vi.mocked(predictMaintenance).mockReturnValue({
      systemPredictions: [{ systemName: "Roofing", urgency: "Good", yearsRemaining: 10 }],
    } as any);
    vi.mocked(quoteService.getRequests).mockResolvedValue([]);
    vi.mocked(contractorService.search).mockResolvedValue([]);
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro", expiresAt: null, cancelledAt: null } as any);
    vi.mocked(getPriceBenchmark).mockResolvedValue(null);
  });

  it("gathers the renewal from the policy, the vault and the claim kit", async () => {
    vi.mocked(photoService.listByJob).mockImplementation(async (jobId: string) =>
      jobId === "docs_P1" ? ([{ description: "[Insurance] declarations-2026.pdf", createdAt: Date.parse("2026-01-03") }] as any) : [],
    );
    const r = await prepareHomeTask({ task: "insurance_renewal", property_id: "P1" });
    expect(r.success).toBe(true);
    expect(photoService.listByJob).toHaveBeenCalledWith("docs_P1");
    expect(insuranceClaimService.list).toHaveBeenCalledWith("P1");
    expect(r.data).toMatchObject({ task: "insurance_renewal", propertyId: "P1" });
    expect((r.data!.facts as any).documents.insurancePapers).toBe(1);
  });

  it("needs the kind of work before it looks for a contractor", async () => {
    const r = await prepareHomeTask({ task: "find_contractor", property_id: "P1" });
    expect(r).toMatchObject({ success: false, error: expect.stringMatching(/service_type/) });
    expect(
      await prepareHomeTask({ task: "find_contractor", property_id: "P1", service_type: "Teleportation" }),
    ).toMatchObject({ success: false });
  });

  it("searches the directory and prices the work for the home's ZIP", async () => {
    const r = await prepareHomeTask({
      task: "find_contractor",
      property_id: "P1",
      service_type: "Plumbing",
      work_description: "Kitchen sink drain leaks",
      urgency: "High",
    });
    expect(r.success).toBe(true);
    expect(contractorService.search).toHaveBeenCalledWith("Plumbing");
    expect(getPriceBenchmark).toHaveBeenCalledWith("Plumbing", "33601");
    expect(r.data!.suggestedSteps).toEqual([
      expect.objectContaining({
        tool: "create_quote_request",
        input: { property_id: "P1", service_type: "Plumbing", description: "Kitchen sink drain leaks", urgency: "High" },
      }),
    ]);
  });

  it("says when the directory or the plan couldn't be read", async () => {
    vi.mocked(contractorService.search).mockRejectedValue(new Error("down"));
    vi.mocked(paymentService.getMySubscription).mockRejectedValue(new Error("down"));
    const r = await prepareHomeTask({ task: "find_contractor", property_id: "P1", service_type: "Plumbing" });
    expect(r.data!.couldNotRead).toEqual(expect.arrayContaining(["contractor directory", "plan"]));
  });
});

// ── AT.5 insurance renewal ──────────────────────────────────────────────────

function item(over: Partial<ReadinessItem>): ReadinessItem {
  return { key: "roof", label: "Roof", status: "documented", evidence: [], missing: [], ageYears: null, ...over };
}

describe("AT.5 — insurance renewal", () => {
  const base = {
    property: home,
    policy,
    jobs: [] as Job[],
    documents: [{ name: "declarations-2026.pdf", kind: "Insurance" as const, added: "2026-01-03" }],
    readiness: null,
    roof: { urgency: "Good" as const, yearsRemaining: 12 },
    openClaims: 0,
    openRequests: [] as { serviceType: string; description: string }[],
    now: NOW,
  };

  it("reports the policy on file and how far off the renewal is, never the policy number", () => {
    const f = insuranceRenewalFacts(base);
    expect(f.task).toBe("insurance_renewal");
    expect(f.facts.policy).toMatchObject({
      carrier: "Gulf Mutual",
      renewalDate: "2026-12-01",
      daysToRenewal: 205,
      coverageADollars: 400_000,
      hurricaneDeductibleDollars: 8_000,
      hasPolicyNumber: true,
    });
    expect(JSON.stringify(f)).not.toMatch(/HO-123/);
  });

  it("lists the last year's roof, electrical, plumbing, HVAC and window work", () => {
    const f = insuranceRenewalFacts({
      ...base,
      jobs: [
        job({ id: "R", serviceType: "Roofing", date: "2025-09-01" }),
        job({ id: "E", serviceType: "Electrical", date: "2026-02-01", permitNumber: "E-1" }),
        job({ id: "P", serviceType: "Painting", date: "2026-03-01" }),
        job({ id: "O", serviceType: "Plumbing", date: "2024-01-01" }),
        job({ id: "X", serviceType: "HVAC", date: "2026-04-01", status: "pending_homeowner_approval" }),
      ],
    });
    expect((f.facts.recentUpdates as any[]).map((j) => j.serviceType)).toEqual(["Electrical", "Roofing"]);
    expect(f.humanSteps.join(" ")).toMatch(/updates/i);
  });

  it("names what's missing from the record", () => {
    expect(insuranceRenewalFacts({ ...base, policy: null }).gaps.join(" ")).toMatch(/no insurance policy on file/i);
    const passed = insuranceRenewalFacts({ ...base, policy: { ...policy, renewalDate: "2026-04-01" } });
    expect(passed.gaps.join(" ")).toMatch(/has passed/i);
    const thin = insuranceRenewalFacts({
      ...base,
      documents: [],
      openClaims: 2,
      policy: { ...policy, coverageA: null, hurricaneDeductible: null },
    });
    const gaps = thin.gaps.join(" ");
    expect(gaps).toMatch(/Coverage A/);
    expect(gaps).toMatch(/hurricane deductible/i);
    expect(gaps).toMatch(/declarations page/i);
    expect(gaps).toMatch(/2 claim records still open/i);
  });

  it("suggests a wind mitigation inspection for a Florida home with no inspection report saved", () => {
    const readiness = {
      fourPoint: [item({ status: "documented" })],
      windMitigation: [item({ key: "openings", label: "Opening protection", status: "missing", missing: ["shutters"] })],
    };
    const f = insuranceRenewalFacts({ ...base, readiness });
    const q = f.suggestedSteps.find((s) => s.tool === "create_quote_request");
    expect(q?.input).toMatchObject({ property_id: "P1", service_type: "Other", urgency: "Low" });
    expect(String(q?.input.description)).toMatch(/wind mitigation/i);
    expect((f.facts.florida as any).windMitigation).toMatchObject({ missing: 1 });
    // Not again when a report is saved or a request is already open.
    const saved = { ...base, readiness, documents: [...base.documents, { name: "wind-mit.pdf", kind: "Inspection" as const, added: "2025-06-01" }] };
    expect(insuranceRenewalFacts(saved).suggestedSteps).toEqual([]);
    const open = { ...base, readiness, openRequests: [{ serviceType: "Other", description: "Wind mitigation inspection (OIR-B1-1802 form)" }] };
    expect(insuranceRenewalFacts(open).suggestedSteps).toEqual([]);
  });

  it("suggests a 4-point inspection when an older system draws carrier attention", () => {
    const readiness = {
      fourPoint: [item({ key: "electrical", label: "Electrical", ageYears: 40, ageNote: "Carriers commonly look closer at panels over 40 years" })],
      windMitigation: [item({ status: "documented" })],
    };
    const f = insuranceRenewalFacts({ ...base, readiness, policy: { ...policy, renewalDate: "2026-06-15" } });
    const q = f.suggestedSteps.find((s) => /4-point/.test(String(s.input.description)));
    expect(q?.input).toMatchObject({ service_type: "Other", urgency: "Medium" });
  });

  it("suggests a roof inspection for a worn roof unless a roofing request is open", () => {
    const worn = { ...base, roof: { urgency: "Critical" as const, yearsRemaining: 0 } };
    expect(insuranceRenewalFacts(worn).suggestedSteps).toEqual([
      expect.objectContaining({ tool: "create_quote_request", input: expect.objectContaining({ service_type: "Roofing" }) }),
    ]);
    expect(
      insuranceRenewalFacts({ ...worn, openRequests: [{ serviceType: "Roofing", description: "roof" }] }).suggestedSteps,
    ).toEqual([]);
  });

  it("keeps shopping and premiums with the user", () => {
    const f = insuranceRenewalFacts(base);
    const all = JSON.stringify(f);
    expect(f.humanSteps.join(" ")).toMatch(/doesn't contact insurers or quote premiums/);
    expect(all).not.toMatch(/you will save|lower your premium|guarantee/i);
    expect(f.links).toContainEqual(expect.objectContaining({ path: "/properties/P1?tab=insurance" }));
  });
});

// ── AT.6 find a contractor ──────────────────────────────────────────────────

function pro(over: Record<string, unknown>) {
  return {
    id: "c",
    name: "Pro",
    specialties: ["Plumbing"],
    trustScore: 50,
    jobsCompleted: 10,
    isVerified: false,
    serviceArea: null,
    serviceZips: [] as string[],
    ...over,
  } as any;
}

describe("AT.6 — find a contractor", () => {
  const base = {
    property: { ...home, zipCode: "33601" },
    serviceType: "Plumbing",
    description: "Kitchen sink drain leaks",
    urgency: "Medium",
    jobs: [] as Job[],
    contractors: [] as any[],
    requests: [] as any[],
    price: null,
    tier: "Pro",
    now: NOW,
  };

  it("lists earlier work of that kind at this home", () => {
    const f = contractorSourcingFacts({
      ...base,
      jobs: [
        job({ id: "A", serviceType: "Plumbing", date: "2024-03-01", contractorName: "Drip Bros", amount: 45_000 }),
        job({ id: "B", serviceType: "Roofing" }),
      ],
    });
    expect(f.task).toBe("find_contractor");
    expect(f.facts.pastWork).toEqual([
      expect.objectContaining({ date: "2024-03-01", contractor: "Drip Bros", amountDollars: 450 }),
    ]);
  });

  it("ranks directory matches that serve the ZIP first, then by trust score, five at most", () => {
    const contractors = [
      pro({ id: "far", name: "Far", trustScore: 99 }),
      pro({ id: "near", name: "Near", trustScore: 60, serviceZips: ["33601"] }),
      ...Array.from({ length: 6 }, (_, i) => pro({ id: `x${i}`, name: `X${i}`, trustScore: 10 + i })),
    ];
    const f = contractorSourcingFacts({ ...base, contractors });
    const dir = f.facts.directory as any;
    expect(dir.listed).toBe(8);
    expect(dir.top.map((c: any) => c.name)).toEqual(["Near", "Far", "X5", "X4", "X3"]);
    expect(dir.top[0]).toMatchObject({ servesThisZip: true });
    expect(dir.note).toMatch(/not a recommendation/i);
    expect(JSON.stringify(f)).not.toMatch(/"id":"near"|email|phone/);
  });

  it("gives the price range with where it comes from", () => {
    const f = contractorSourcingFacts({
      ...base,
      price: { serviceType: "Plumbing", zipCode: "33601", low: 20_000, median: 35_000, high: 90_000, source: "national", sampleSize: 0 },
    });
    expect(f.facts.price).toMatchObject({ lowDollars: 200, typicalDollars: 350, highDollars: 900 });
    expect((f.facts.price as any).basis).toMatch(/not local prices/i);
  });

  it("suggests one quote request with the user's words", () => {
    expect(contractorSourcingFacts(base).suggestedSteps).toEqual([
      {
        tool: "create_quote_request",
        input: { property_id: "P1", service_type: "Plumbing", description: "Kitchen sink drain leaks", urgency: "Medium" },
        why: expect.any(String),
      },
    ]);
  });

  it("doesn't suggest a request without a description, beside an open one, or over the Free limit", () => {
    const none = contractorSourcingFacts({ ...base, description: "  " });
    expect(none.suggestedSteps).toEqual([]);
    expect(none.gaps.join(" ")).toMatch(/describe the work/i);

    const open = contractorSourcingFacts({
      ...base,
      requests: [{ id: "Q1", propertyId: "P1", serviceType: "Plumbing", status: "quoted", createdAt: Date.parse("2026-05-01"), description: "" }],
    });
    expect(open.suggestedSteps).toEqual([]);
    expect(open.gaps.join(" ")).toMatch(/already have an open Plumbing quote request/);

    const full = contractorSourcingFacts({
      ...base,
      tier: "Free",
      requests: ["A", "B", "C"].map((id) => ({ id, propertyId: "P9", serviceType: "HVAC", status: "open", createdAt: 0, description: "" })),
    });
    expect(full.suggestedSteps).toEqual([]);
    expect(full.gaps.join(" ")).toMatch(/Free accounts can have 3 open quote requests/);
  });

  it("says when nobody in the directory lists the work, and keeps hiring with the user", () => {
    const f = contractorSourcingFacts(base);
    expect(f.gaps.join(" ")).toMatch(/no contractor in the directory lists Plumbing/i);
    expect(f.humanSteps.join(" ")).toMatch(/accept one yourself/i);
    expect(f.suggestedSteps).toHaveLength(1);
  });
});
