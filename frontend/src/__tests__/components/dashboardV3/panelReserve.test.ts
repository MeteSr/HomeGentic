/**
 * #723: the reserve target shows in the dashboard's Forecast and Spend panels.
 *
 *  PR.1 Forecast adds a monthly reserve row worked out from the same estimates
 *  PR.2 Spend sets the yearly target next to this year's actual spend
 *  PR.3 both say it's an estimate; with nothing due the rows say so instead of $0
 *  PR.4 no property, no reserve rows
 */
import { describe, it, expect } from "vitest";
import { buildPanels, type PanelCtx } from "@/components/dashboardV3/panelData";
import { estimateSystems } from "@/services/systemAgeEstimator";
import { maintenanceReserve } from "@/services/maintenanceReserve";
import { formatDollars } from "@/utils/format";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

const thisYear = new Date().getFullYear();

function ctx(over: Partial<PanelCtx> = {}): PanelCtx {
  return {
    score: 0,
    grade: "F",
    breakdown: { verifiedJobPts: 0, valuePts: 0, verificationPts: 0, diversityPts: 0 } as any,
    premium: null,
    zipCode: "",
    activeProperty: { id: "P1", address: "9 Basis Lane", yearBuilt: 1995n, state: "FL" } as unknown as Property,
    properties: [],
    jobs: [],
    pendingProposals: [],
    decayEvents: [],
    atRiskWarnings: [],
    scoreEvents: [],
    quoteRequests: [],
    bidCountMap: {},
    recurringServices: [],
    visitLogMap: {},
    rooms: [],
    sensorDevices: [],
    sensorAlerts: [],
    systemAges: {} as any,
    people: null,
    planTier: "Free",
    subExpiresAt: null,
    subCancelledAt: null,
    agentCreditsLeft: null,
    agentQuotaExhausted: false,
    goPanel: () => {},
    openFlow: () => {},
    approveProposal: () => {},
    declineProposal: () => {},
    approveAll: () => {},
    navigate: () => {},
    ...over,
  };
}

const job = (date: string, amount: number): Job =>
  ({ id: date, propertyId: "P1", date, amount, serviceType: "HVAC", verified: true }) as unknown as Job;

describe("reserve target in the dashboard panels", () => {
  it("PR.1 adds a monthly reserve row to Forecast from the same estimates", () => {
    const c = ctx();
    const r = maintenanceReserve(estimateSystems(1995, "FL", {}), [], new Date());
    expect(r.systemsDue.length).toBeGreaterThan(0);
    const row = buildPanels(c).forecast.rows.find((x) => x.lead === "Monthly reserve")!;
    expect(row).toBeDefined();
    expect(row.right).toBe(`${formatDollars(r.monthlyLow)}–${formatDollars(r.monthlyHigh)}`);
    expect(row.rightSub).toBe("A MONTH");
    expect(row.sub).toMatch(/ESTIMATE/);
  });

  it("PR.2 puts the yearly target next to this year's spend in Spend", () => {
    const c = ctx({ jobs: [job(`${thisYear}-02-01`, 120_000), job(`${thisYear - 1}-02-01`, 500_000)] });
    const r = maintenanceReserve(estimateSystems(1995, "FL", {}), c.jobs, new Date());
    const row = buildPanels(c).spend.rows.find((x) => x.lead === "Reserve target")!;
    expect(row).toBeDefined();
    expect(row.right).toBe(`${formatDollars(r.yearlyLow)}–${formatDollars(r.yearlyHigh)}`);
    expect(row.rightSub).toBe("A YEAR");
    expect(row.sub).toContain(`$1,200 SPENT IN ${thisYear}`);
    expect(row.sub).toMatch(/ESTIMATE/);
  });

  it("PR.3 says nothing is due instead of showing $0", () => {
    const year = thisYear;
    const c = ctx({
      activeProperty: { id: "P1", address: "New build", yearBuilt: BigInt(year), state: "FL" } as unknown as Property,
    });
    const row = buildPanels(c).forecast.rows.find((x) => x.lead === "Monthly reserve");
    expect(row).toBeDefined();
    expect(row!.right).toBe("$0");
    expect(row!.sub).toMatch(/NOTHING DUE WITHIN 5 YEARS/);
  });

  it("PR.4 has no reserve rows without a property", () => {
    const p = buildPanels(ctx({ activeProperty: null }));
    expect(p.forecast.rows.find((x) => x.lead === "Monthly reserve")).toBeUndefined();
    expect(p.spend.rows.find((x) => x.lead === "Reserve target")).toBeUndefined();
  });
});
