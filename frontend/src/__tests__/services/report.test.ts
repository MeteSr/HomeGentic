import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Stateful mock actor for the report canister ──────────────────────────────

let _mockCounter = 0;
const _mockSnapshots = new Map<string, any>(); // snapshotId → raw snapshot
const _mockLinks = new Map<string, any>();      // token → raw link

function makePrincipal() { return { toText: () => "local" }; }

const mockReportActor = {
  generateReport: vi.fn(async (
    propertyId: string,
    property: any,
    jobs: any[],
    recurringServices: any[],
    expiryDays: any[],
    visibility: any,
    rooms: any[],
    ...rest: any[]
  ) => {
    _mockCounter++;
    const snapshotId = `SNAP_${_mockCounter}`;
    const token      = `RPT_${_mockCounter}_${Date.now()}`;

    const expiresNs = expiryDays[0] != null
      ? [BigInt(Date.now() + Number(expiryDays[0]) * 86_400_000) * 1_000_000n]
      : [];

    const totalAmountCents = jobs.reduce((s: number, j: any) => s + Number(j.amountCents), 0);
    const verifiedJobCount = jobs.filter((j: any) => j.isVerified).length;
    const diyJobCount      = jobs.filter((j: any) => j.isDiy).length;
    const permitCount      = jobs.filter((j: any) => j.permitNumber?.length > 0).length;

    const rawSnapshot = {
      snapshotId,
      propertyId,
      generatedBy:      makePrincipal(),
      address:          property.address,
      city:             property.city,
      state:            property.state,
      zipCode:          property.zipCode,
      propertyType:     property.propertyType,
      yearBuilt:        property.yearBuilt,
      squareFeet:       property.squareFeet,
      verificationLevel: property.verificationLevel,
      jobs,
      recurringServices,
      rooms:            rooms.length > 0 ? rooms : [],
      totalAmountCents: BigInt(totalAmountCents),
      verifiedJobCount: BigInt(verifiedJobCount),
      diyJobCount:      BigInt(diyJobCount),
      permitCount:      BigInt(permitCount),
      generatedAt:      BigInt(Date.now()) * 1_000_000n,
      planTier:         "Free",
    };

    const rawLink = {
      token,
      snapshotId,
      propertyId,
      createdBy:  makePrincipal(),
      expiresAt:  expiresNs,
      visibility,
      viewCount:  BigInt(0),
      isActive:   true,
      createdAt:  BigInt(Date.now()) * 1_000_000n,
    };

    _mockSnapshots.set(token, rawSnapshot);
    _mockLinks.set(token, rawLink);
    return { ok: rawLink };
  }),

  getReport: vi.fn(async (token: string) => {
    const link = _mockLinks.get(token);
    if (!link) return { err: { NotFound: null } };
    if (!link.isActive) return { err: { Revoked: null } };
    // Check expiry
    const expiresNs = link.expiresAt[0];
    if (expiresNs != null && Number(expiresNs) / 1_000_000 < Date.now()) {
      return { err: { Expired: null } };
    }
    link.viewCount = link.viewCount + 1n;
    const snapshot = _mockSnapshots.get(token);
    return { ok: [link, snapshot] };
  }),

  listShareLinks: vi.fn(async (propertyId: string) => {
    return [..._mockLinks.values()].filter((l) => l.propertyId === propertyId);
  }),

  revokeShareLink: vi.fn(async (token: string) => {
    const link = _mockLinks.get(token);
    if (!link) return { err: { NotFound: null } };
    link.isActive = false;
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => mockReportActor) },
}));

import { reportService } from "@/services/report";
import type { PropertyInput, JobInput } from "@/services/report";

beforeEach(() => {
  _mockCounter = 0;
  _mockSnapshots.clear();
  _mockLinks.clear();
  // Re-wire mocks (vi.clearAllMocks not called here, but ensure fresh state)
  reportService.reset();
});

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
    const link = await reportService.generateReport("prop-1", makeProperty(), jobs, [], [], 30, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.totalAmountCents).toBe(300_000);
  });

  it("counts verifiedJobCount correctly", async () => {
    const jobs = [
      makeJob({ isVerified: true  }),
      makeJob({ isVerified: false, serviceType: "Roofing"    }),
      makeJob({ isVerified: true,  serviceType: "Plumbing"   }),
    ];
    const link = await reportService.generateReport("prop-2", makeProperty(), jobs, [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.verifiedJobCount).toBe(2);
  });

  it("counts diyJobCount correctly", async () => {
    const jobs = [
      makeJob({ isDiy: true,  serviceType: "Painting"   }),
      makeJob({ isDiy: false, serviceType: "HVAC"       }),
      makeJob({ isDiy: true,  serviceType: "Flooring"   }),
    ];
    const link = await reportService.generateReport("prop-3", makeProperty(), jobs, [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.diyJobCount).toBe(2);
  });

  it("counts permitCount correctly", async () => {
    const jobs = [
      makeJob({ permitNumber: "HVAC-001"  }),
      makeJob({ permitNumber: undefined,   serviceType: "Painting" }),
      makeJob({ permitNumber: "ROOF-002",  serviceType: "Roofing"  }),
    ];
    const link = await reportService.generateReport("prop-4", makeProperty(), jobs, [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.permitCount).toBe(2);
  });

  it("snapshot is 0-amount when no jobs", async () => {
    const link = await reportService.generateReport("prop-5", makeProperty(), [], [], [], null, "Public");
    const { snapshot } = await reportService.getReport(link.token);
    expect(snapshot.totalAmountCents).toBe(0);
    expect(snapshot.verifiedJobCount).toBe(0);
    expect(snapshot.diyJobCount).toBe(0);
    expect(snapshot.permitCount).toBe(0);
  });

  it("snapshot preserves property fields", async () => {
    const prop = makeProperty({ address: "456 Oak Ave", city: "Denver", state: "CO" });
    const link = await reportService.generateReport("prop-6", prop, [], [], [], null, "Public");
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
      "prop-revoke", makeProperty(), [], [], [], null, "Public"
    );
    await reportService.revokeShareLink(link.token);
    await expect(reportService.getReport(link.token)).rejects.toThrow("revoked");
  });

  it("increments viewCount on each call", async () => {
    const link = await reportService.generateReport(
      "prop-views", makeProperty(), [], [], [], null, "Public"
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
    await reportService.generateReport("prop-A", makeProperty(), [], [], [], null, "Public");
    await reportService.generateReport("prop-A", makeProperty(), [], [], [], null, "Public");
    await reportService.generateReport("prop-B", makeProperty(), [], [], [], null, "Public");

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
    // Subtract 1 minute so the value stays strictly within 2 full days.
    // Math.ceil(1.999... days) = 2.
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const label = reportService.expiryLabel({ expiresAt: Date.now() + twoDaysMs - 60_000 } as any);
    expect(label).toBe("Expires in 2 days");
  });

  it('returns singular "day" for 1-day expiry', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const label = reportService.expiryLabel({ expiresAt: Date.now() + oneDayMs - 60_000 } as any);
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

  it("returns a clean URL with no query string when no options are passed", () => {
    const url = reportService.shareUrl("RPT_token");
    expect(url).not.toContain("?");
  });

  it("appends ha=1 when hideAmounts is true", () => {
    const url = reportService.shareUrl("RPT_token", { hideAmounts: true });
    expect(new URL(url).searchParams.get("ha")).toBe("1");
  });

  it("appends hc=1 when hideContractors is true", () => {
    const url = reportService.shareUrl("RPT_token", { hideContractors: true });
    expect(new URL(url).searchParams.get("hc")).toBe("1");
  });

  it("appends hp=1 when hidePermits is true", () => {
    const url = reportService.shareUrl("RPT_token", { hidePermits: true });
    expect(new URL(url).searchParams.get("hp")).toBe("1");
  });

  it("appends hd=1 when hideDescriptions is true", () => {
    const url = reportService.shareUrl("RPT_token", { hideDescriptions: true });
    expect(new URL(url).searchParams.get("hd")).toBe("1");
  });

  it("omits params for false disclosure flags", () => {
    const url = reportService.shareUrl("RPT_token", {
      hideAmounts: false, hideContractors: false, hidePermits: false, hideDescriptions: false,
    });
    expect(url).not.toContain("?");
  });

  it("encodes all four flags when all are true", () => {
    const url = reportService.shareUrl("RPT_token", {
      hideAmounts: true, hideContractors: true, hidePermits: true, hideDescriptions: true,
    });
    const p = new URL(url).searchParams;
    expect(p.get("ha")).toBe("1");
    expect(p.get("hc")).toBe("1");
    expect(p.get("hp")).toBe("1");
    expect(p.get("hd")).toBe("1");
  });
});

// ─── getReport — expired link ──────────────────────────────────────────────────

describe("reportService.getReport — expired link", () => {
  it("throws when the link's expiresAt is in the past", async () => {
    // expiryDays = 0 would be odd; use a negative approach: create with 1-day expiry
    // then set system time to the future
    const { vi } = await import("vitest");
    const link = await reportService.generateReport("prop-exp", makeProperty(), [], [], [], 1, "Public");

    // Advance time beyond 1 day
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000);
    try {
      await expect(reportService.getReport(link.token)).rejects.toThrow("expired");
    } finally {
      vi.useRealTimers();
    }
  });
});
