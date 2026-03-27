import { describe, it, expect, beforeEach } from "vitest";
import { reportService } from "@/services/report";
import type { PropertyInput, JobInput } from "@/services/report";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    address:           "123 Elm St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily",
    yearBuilt:         2000,
    squareFeet:        2200,
    verificationLevel: "Basic",
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobInput> = {}): JobInput {
  return {
    serviceType:    "HVAC",
    description:    "HVAC replacement",
    contractorName: "Cool Air LLC",
    amountCents:    240_000,
    date:           "2024-06-15",
    isDiy:          false,
    permitNumber:   "HVAC-2024-001",
    warrantyMonths: 120,
    isVerified:     true,
    status:         "verified",
    ...overrides,
  };
}

// ─── generateReport ───────────────────────────────────────────────────────────

describe("reportService.generateReport", () => {
  it("creates a snapshot with correct totalAmountCents", async () => {
    const jobs = [
      makeJob({ amountCents: 100_000 }),
      makeJob({ amountCents: 200_000, serviceType: "Roofing" }),
    ];
    const link = await reportService.generateReport("prop-1", makeProperty(), jobs, [], 30, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.totalAmountCents).toBe(300_000);
  });

  it("counts verifiedJobCount correctly", async () => {
    const jobs = [
      makeJob({ isVerified: true  }),
      makeJob({ isVerified: false, serviceType: "Roofing"    }),
      makeJob({ isVerified: true,  serviceType: "Plumbing"   }),
    ];
    const link = await reportService.generateReport("prop-2", makeProperty(), jobs, [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.verifiedJobCount).toBe(2);
  });

  it("counts diyJobCount correctly", async () => {
    const jobs = [
      makeJob({ isDiy: true,  serviceType: "Painting"   }),
      makeJob({ isDiy: false, serviceType: "HVAC"       }),
      makeJob({ isDiy: true,  serviceType: "Flooring"   }),
    ];
    const link = await reportService.generateReport("prop-3", makeProperty(), jobs, [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.diyJobCount).toBe(2);
  });

  it("counts permitCount correctly", async () => {
    const jobs = [
      makeJob({ permitNumber: "HVAC-001"  }),
      makeJob({ permitNumber: undefined,   serviceType: "Painting" }),
      makeJob({ permitNumber: "ROOF-002",  serviceType: "Roofing"  }),
    ];
    const link = await reportService.generateReport("prop-4", makeProperty(), jobs, [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.permitCount).toBe(2);
  });

  it("snapshot is 0-amount when no jobs", async () => {
    const link = await reportService.generateReport("prop-5", makeProperty(), [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.totalAmountCents).toBe(0);
    expect(snapshot.verifiedJobCount).toBe(0);
    expect(snapshot.diyJobCount).toBe(0);
    expect(snapshot.permitCount).toBe(0);
  });

  it("snapshot preserves property fields", async () => {
    const prop = makeProperty({ address: "456 Oak Ave", city: "Denver", state: "CO" });
    const link = await reportService.generateReport("prop-6", prop, [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.address).toBe("456 Oak Ave");
    expect(snapshot.city).toBe("Denver");
    expect(snapshot.state).toBe("CO");
  });
});

// ─── getReport ────────────────────────────────────────────────────────────────

describe("reportService.getReport", () => {
  it("throws when token does not exist", async () => {
    await expect(reportService.getReport("RPT_does_not_exist")).rejects.toThrow("not found");
  });

  it("throws when link has been revoked", async () => {
    const link = await reportService.generateReport(
      "prop-revoke", makeProperty(), [], [], null, "Public"
    );
    await reportService.revokeShareLink(link.token);
    await expect(reportService.getReport(link.token)).rejects.toThrow("revoked");
  });

  it("increments viewCount on each call", async () => {
    const link = await reportService.generateReport(
      "prop-views", makeProperty(), [], [], null, "Public"
    );
    await reportService.getReport(link.token);
    await reportService.getReport(link.token);
    const all = await reportService.listShareLinks("prop-views");
    const stored = all.find((l) => l.token === link.token)!;
    expect(stored.viewCount).toBe(2);
  });
});

// ─── listShareLinks ───────────────────────────────────────────────────────────

describe("reportService.listShareLinks", () => {
  it("returns only links for the given propertyId", async () => {
    await reportService.generateReport("prop-A", makeProperty(), [], [], null, "Public");
    await reportService.generateReport("prop-A", makeProperty(), [], [], null, "Public");
    await reportService.generateReport("prop-B", makeProperty(), [], [], null, "Public");

    const linksA = await reportService.listShareLinks("prop-A");
    const linksB = await reportService.listShareLinks("prop-B");

    linksA.forEach((l) => expect(l.propertyId).toBe("prop-A"));
    linksB.forEach((l) => expect(l.propertyId).toBe("prop-B"));
    expect(linksB.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── expiryLabel ──────────────────────────────────────────────────────────────

describe("reportService.expiryLabel", () => {
  it('returns "Never expires" when expiresAt is null', () => {
    const label = reportService.expiryLabel({ expiresAt: null } as any);
    expect(label).toBe("Never expires");
  });

  it('returns "Expired" for a past timestamp', () => {
    const label = reportService.expiryLabel({ expiresAt: Date.now() - 1000 } as any);
    expect(label).toBe("Expired");
  });

  it('returns "Expires in N days" for a future timestamp', () => {
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const label = reportService.expiryLabel({ expiresAt: Date.now() + twoDaysMs + 5000 } as any);
    expect(label).toBe("Expires in 2 days");
  });

  it('returns singular "day" for 1-day expiry', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const label = reportService.expiryLabel({ expiresAt: Date.now() + oneDayMs + 5000 } as any);
    expect(label).toBe("Expires in 1 day");
  });
});

// ─── shareUrl ─────────────────────────────────────────────────────────────────

describe("reportService.shareUrl", () => {
  it("returns a URL containing the token", () => {
    const url = reportService.shareUrl("RPT_42_123456");
    expect(url).toContain("RPT_42_123456");
    expect(url).toMatch(/^http/);
  });
});
