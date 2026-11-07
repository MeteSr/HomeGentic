import { describe, it, expect } from "vitest";
import {
  suggestCategory,
  buildImprovementRecord,
  improvementRecordCsv,
  IMPROVEMENT_SUGGEST_CENTS,
} from "@/services/improvementRecord";
import type { Job } from "@/services/job";

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1",
    propertyId: "p1",
    homeowner: "owner",
    serviceType: "Roofing",
    contractorName: "Acme Roofing",
    amount: 1_500_000,
    date: "2024-03-10",
    description: "Full roof replacement",
    isDiy: false,
    status: "verified",
    verified: true,
    homeownerSigned: true,
    contractorSigned: true,
    photos: [],
    createdAt: 0,
    ...overrides,
  };
}

describe("suggestCategory", () => {
  it("suggests an improvement for remodels, solar and insulation at any cost", () => {
    for (const serviceType of ["Kitchen Remodel", "Bathroom Remodel", "Solar", "Insulation"]) {
      expect(suggestCategory(job({ serviceType, amount: 40_000 }))).toBe("improvement");
    }
  });

  it("suggests a repair for upkeep trades at any cost", () => {
    for (const serviceType of ["Pest Control", "General Handyman", "Painting", "Drywall"]) {
      expect(suggestCategory(job({ serviceType, amount: 2_000_000 }))).toBe("repair");
    }
  });

  it("goes by cost for everything else", () => {
    expect(suggestCategory(job({ serviceType: "Roofing", amount: IMPROVEMENT_SUGGEST_CENTS }))).toBe("improvement");
    expect(suggestCategory(job({ serviceType: "Roofing", amount: IMPROVEMENT_SUGGEST_CENTS - 1 }))).toBe("repair");
    expect(suggestCategory(job({ serviceType: "HVAC", amount: 900_000 }))).toBe("improvement");
    expect(suggestCategory(job({ serviceType: "Plumbing", amount: 35_000 }))).toBe("repair");
  });

  it("treats an unknown service type by cost", () => {
    expect(suggestCategory(job({ serviceType: "Something new", amount: 800_000 }))).toBe("improvement");
  });
});

describe("buildImprovementRecord", () => {
  const roof = job({ id: "roof", date: "2024-03-10", amount: 1_500_000 });
  const leak = job({
    id: "leak",
    date: "2023-06-01",
    serviceType: "Plumbing",
    amount: 40_000,
    contractorName: "Pipes Co",
  });
  const deck = job({
    id: "deck",
    date: "2022-09-15",
    serviceType: "Other",
    amount: 300_000,
    isDiy: true,
    contractorName: undefined,
    verified: false,
    status: "completed",
  });

  it("uses the owner's mark over the suggestion and says which it is", () => {
    const rec = buildImprovementRecord([roof, leak, deck], { deck: "improvement", roof: "repair" });
    const byId = Object.fromEntries(rec.rows.map((r) => [r.job.id, r]));
    expect(byId.deck).toMatchObject({ category: "improvement", source: "owner" });
    expect(byId.roof).toMatchObject({ category: "repair", source: "owner" });
    expect(byId.leak).toMatchObject({ category: "repair", source: "suggested" });
  });

  it("lists work oldest first and totals the improvements", () => {
    const rec = buildImprovementRecord([roof, leak, deck], { deck: "improvement" });
    expect(rec.rows.map((r) => r.job.id)).toEqual(["deck", "leak", "roof"]);
    expect(rec.improvementTotalCents).toBe(1_800_000);
    expect(rec.improvementCount).toBe(2);
    expect(rec.repairTotalCents).toBe(40_000);
  });

  it("leaves out contractor proposals the owner hasn't accepted", () => {
    const proposal = job({ id: "prop", status: "pending_homeowner_approval", verified: false });
    const rejected = job({ id: "rej", status: "rejected_by_homeowner", verified: false });
    const rec = buildImprovementRecord([roof, proposal, rejected], {});
    expect(rec.rows.map((r) => r.job.id)).toEqual(["roof"]);
  });

  it("keeps only work on or after the 'since' date when one is given", () => {
    const rec = buildImprovementRecord([roof, leak, deck], {}, "2023-06-01");
    expect(rec.rows.map((r) => r.job.id)).toEqual(["leak", "roof"]);
  });
});

describe("improvementRecordCsv", () => {
  it("writes one header and one row per job with the columns a preparer needs", () => {
    const rec = buildImprovementRecord(
      [
        job({ id: "roof" }),
        job({
          id: "deck",
          date: "2022-09-15",
          serviceType: "Other",
          amount: 300_000,
          isDiy: true,
          contractorName: undefined,
          verified: false,
          status: "completed",
          description: "Back deck",
        }),
      ],
      { deck: "improvement" },
    );
    const lines = improvementRecordCsv(rec.rows).trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Date,Work,Service type,Done by,Amount (USD),Category,Category set by,Record status,Permit number",
    );
    expect(lines[1]).toBe("2022-09-15,Back deck,Other,DIY (homeowner),3000.00,Improvement,Owner,Not yet signed,");
    expect(lines[2]).toBe(
      "2024-03-10,Full roof replacement,Roofing,Acme Roofing,15000.00,Improvement,Suggested,Verified: homeowner and contractor signed,",
    );
    expect(lines).toHaveLength(3);
  });

  it("marks a verified DIY job as signed by the homeowner", () => {
    const rec = buildImprovementRecord([job({ isDiy: true, contractorName: undefined })], {});
    expect(improvementRecordCsv(rec.rows)).toContain("Verified: homeowner signed (DIY)");
  });

  it("quotes commas, quotes and line breaks", () => {
    const rec = buildImprovementRecord(
      [job({ description: 'Roof, "30-year"\nshingles', contractorName: "Smith, Jones & Co", permitNumber: "BLD-1" })],
      {},
    );
    const out = improvementRecordCsv(rec.rows);
    expect(out).toContain('"Roof, ""30-year""\nshingles"');
    expect(out).toContain('"Smith, Jones & Co"');
    expect(out).toContain(",BLD-1\r\n");
  });

  it("stops a spreadsheet from running a cell as a formula", () => {
    const rec = buildImprovementRecord([job({ description: '=HYPERLINK("x")', contractorName: "+Evil" })], {});
    const out = improvementRecordCsv(rec.rows);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain(",'+Evil,");
  });
});
