/**
 * #717: what goes on the owner's calendar (services/calendarEvents.ts).
 * The same builders feed the one-off "Add to calendar" downloads and the
 * private subscribe feed.
 *
 *  CE.1 maintenance tasks keep the due date the Maintenance page shows
 *  CE.2 a job with a warranty gives one "warranty ends" event; none without
 *  CE.3 an active recurring service gives a repeating visit from its next due date
 *  CE.4 paused and cancelled services give nothing
 *  CE.5 collectCalendarEvents gathers every home, skips ended warranties,
 *       sorts by date and caps the list
 *  CE.6 feedVersion changes only when the events do
 *  CE.7 an insurance policy gives a renewal event on its renewal date, without
 *       the policy number (anyone with the link can read the feed); none once
 *       the date has passed or when it isn't a real date
 *  CE.8 a Florida home gets the homestead deadline, the TRIM notice month and
 *       a saved petition deadline, each from today on, and skips what the
 *       owner has already settled; other states get nothing
 *  CE.9 collectCalendarEvents adds insurance renewals and tax deadlines
 */
import { describe, it, expect } from "vitest";
import {
  maintenanceTaskDueDate,
  maintenanceTaskEvent,
  warrantyEndEvent,
  recurringVisitEvent,
  insuranceRenewalEvent,
  floridaTaxEvents,
  collectCalendarEvents,
  feedVersion,
  MAX_FEED_EVENTS,
} from "@/services/calendarEvents";
import type { AnnualTask } from "@/services/maintenance";
import type { Job } from "@/services/job";
import type { RecurringService } from "@/services/recurringService";
import type { Property } from "@/services/property";
import type { InsurancePolicy } from "@/services/insurancePolicy";

const NOW = new Date(2026, 10, 8, 12, 0, 0); // Nov 8 2026, local

const task = (over: Partial<AnnualTask> = {}): AnnualTask => ({
  task: "Clean gutters",
  frequency: "Annually",
  season: "Fall",
  estimatedCost: "$150–$250",
  estimatedCostLowCents: 15_000,
  estimatedCostHighCents: 25_000,
  diyViable: true,
  ...over,
});

const job = (over: Partial<Job> = {}): Job => ({
  id: "J1",
  propertyId: "P1",
  homeowner: "me",
  serviceType: "HVAC",
  contractorName: "Cool Air Co",
  amount: 500_000,
  date: "2026-01-15",
  description: "New condenser",
  isDiy: false,
  warrantyMonths: 24,
  status: "verified" as any,
  verified: true,
  homeownerSigned: true,
  contractorSigned: true,
  photos: [],
  createdAt: 0,
  ...over,
});

const svc = (over: Partial<RecurringService> = {}): RecurringService => ({
  id: "R1",
  propertyId: "P1",
  homeowner: "me",
  serviceType: "PestControl",
  providerName: "Bug Busters",
  frequency: "Quarterly",
  startDate: "2026-02-01",
  status: "Active",
  createdAt: 0,
  ...over,
});

const prop = (id: string, address: string): Property =>
  ({ id, address, city: "Orlando", state: "FL", zipCode: "32801", yearBuilt: 1990n }) as unknown as Property;

describe("maintenance tasks", () => {
  it("CE.1 dates a seasonal task in its season and keeps the page's date", () => {
    const due = maintenanceTaskDueDate(task({ season: "Spring" }), 0, NOW);
    expect(due.getFullYear()).toBe(2027);
    expect(due.getMonth()).toBe(2); // March, the first spring month after November
    expect(due.getDate()).toBe(15);

    const e = maintenanceTaskEvent("P1", "9 Basis Lane", task(), new Date(2026, 11, 15));
    expect(e).toMatchObject({ uid: "maint-P1-clean-gutters", date: "2026-12-15", title: "Clean gutters" });
    expect(e.description).toContain("9 Basis Lane");
    expect(e.description).toContain("$150–$250");
    expect(e.description).toMatch(/estimate/i);
  });
});

describe("warranties", () => {
  it("CE.2 gives one event on the warranty end date, and none without a warranty", () => {
    const e = warrantyEndEvent(job())!;
    expect(e.uid).toBe("warranty-J1");
    expect(e.date).toBe("2028-01-15");
    expect(e.title).toBe("Warranty ends: HVAC (Cool Air Co)");
    expect(warrantyEndEvent(job({ warrantyMonths: 0 }))).toBeNull();
    expect(warrantyEndEvent(job({ warrantyMonths: undefined }))).toBeNull();
  });
});

describe("recurring visits", () => {
  it("CE.3 repeats from the next due visit (last visit plus one period) until the contract ends", () => {
    const e = recurringVisitEvent(
      svc({ contractEndDate: "2027-12-31" }),
      [
        { id: "v1", serviceId: "R1", propertyId: "P1", visitDate: "2026-10-01", createdAt: 0 },
        { id: "v0", serviceId: "R1", propertyId: "P1", visitDate: "2026-07-01", createdAt: 0 },
      ],
      "9 Basis Lane",
    )!;
    expect(e.uid).toBe("recurring-R1");
    expect(e.date).toBe("2026-12-30"); // Oct 1 + 90 days
    expect(e.rrule).toBe("FREQ=MONTHLY;INTERVAL=3;UNTIL=20271231");
    expect(e.title).toBe("Pest Control visit (Bug Busters)");

    const fromStart = recurringVisitEvent(svc({ frequency: "Weekly" }), [])!;
    expect(fromStart.date).toBe("2026-02-08");
    expect(fromStart.rrule).toBe("FREQ=WEEKLY");
  });

  it("CE.4 gives nothing for paused or cancelled services", () => {
    expect(recurringVisitEvent(svc({ status: "Paused" }), [])).toBeNull();
    expect(recurringVisitEvent(svc({ status: "Cancelled" }), [])).toBeNull();
  });
});

describe("collectCalendarEvents", () => {
  it("CE.5 gathers every home, skips ended warranties, sorts by date and caps the list", () => {
    const events = collectCalendarEvents({
      properties: [prop("P1", "9 Basis Lane"), prop("P2", "4 Oak St")],
      jobs: [job(), job({ id: "J2", date: "2020-01-01", warrantyMonths: 12 }), job({ id: "J3", propertyId: "P2" })],
      recurring: { P1: [{ service: svc(), visits: [] }], P2: [] },
      systemAges: () => ({}),
      now: NOW,
    });
    const uids = events.map((e) => e.uid);
    expect(uids).toContain("warranty-J1");
    expect(uids).toContain("warranty-J3");
    expect(uids).not.toContain("warranty-J2");
    expect(uids).toContain("recurring-R1");
    expect(uids.some((u) => u.startsWith("maint-P1-"))).toBe(true);
    expect(uids.some((u) => u.startsWith("maint-P2-"))).toBe(true);
    expect(new Set(uids).size).toBe(uids.length);
    const dates = events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);

    const many = collectCalendarEvents({
      properties: [],
      jobs: Array.from({ length: MAX_FEED_EVENTS + 20 }, (_, i) => job({ id: `J${i}` })),
      recurring: {},
      systemAges: () => ({}),
      now: NOW,
    });
    expect(many).toHaveLength(MAX_FEED_EVENTS);
  });

  it("CE.6 changes feedVersion only when the events change", () => {
    const a = [warrantyEndEvent(job())!];
    expect(feedVersion(a)).toBe(feedVersion([{ ...a[0] }]));
    expect(feedVersion(a)).not.toBe(feedVersion([{ ...a[0], date: "2028-01-16" }]));
    expect(feedVersion([])).toMatch(/^[0-9a-f]{8,}$/);
  });
});

const policy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  carrier: "Citizens",
  policyNumber: "HO3-1234567",
  renewalDate: "2027-01-20",
  coverageA: 350_000,
  hurricaneDeductible: { kind: "percent", percent: 2 },
  ...over,
});

describe("insurance renewals", () => {
  it("CE.7 gives one renewal event, without the policy number, and none once it has passed", () => {
    const e = insuranceRenewalEvent("P1", "9 Basis Lane", policy(), NOW)!;
    expect(e).toMatchObject({ uid: "insurance-P1", date: "2027-01-20", title: "Home insurance renews (Citizens)" });
    expect(e.description).toContain("9 Basis Lane");
    expect(e.description).not.toContain("HO3-1234567");
    expect(e.rrule).toBeUndefined();
    expect(insuranceRenewalEvent("P1", "", policy({ carrier: "" }), NOW)!.title).toBe("Home insurance renews");
    expect(insuranceRenewalEvent("P1", "", policy({ renewalDate: "2026-11-08" }), NOW)?.date).toBe("2026-11-08");
    expect(insuranceRenewalEvent("P1", "", policy({ renewalDate: "2026-11-07" }), NOW)).toBeNull();
    expect(insuranceRenewalEvent("P1", "", policy({ renewalDate: "" }), NOW)).toBeNull();
    expect(insuranceRenewalEvent("P1", "", policy({ renewalDate: "2027-02-30" }), NOW)).toBeNull();
    expect(insuranceRenewalEvent("P1", "", null, NOW)).toBeNull();
  });
});

describe("Florida tax deadlines", () => {
  it("CE.8 dates the homestead deadline, the TRIM month and a saved petition deadline from today on", () => {
    const events = floridaTaxEvents("P1", "9 Basis Lane", "FL", [], NOW);
    expect(events.map((e) => [e.uid, e.date])).toEqual([
      ["tax-P1-homestead-2027", "2027-03-01"],
      ["tax-P1-trim-2027", "2027-08-01"],
    ]);
    const [homestead, trim] = events;
    expect(homestead.title).toBe("Homestead exemption deadline");
    expect(homestead.description).toContain("9 Basis Lane");
    expect(homestead.description).toContain("https://www.flsenate.gov/Laws/Statutes/2026/196.011");
    expect(homestead.description).toMatch(/not tax advice/i);
    expect(trim.title).toBe("Proposed property tax notice (TRIM) due this month");
    expect(trim.description).toContain("https://floridarevenue.com/property/Documents/pt101.pdf");

    // A homestead already applied for, or granted last year, needs no reminder.
    expect(
      floridaTaxEvents("P1", "", "Florida", [{ year: 2027, exemption: "Applied", petitionDeadline: "" }], NOW).map(
        (e) => e.uid,
      ),
    ).toEqual(["tax-P1-trim-2027"]);
    expect(
      floridaTaxEvents("P1", "", "FL", [{ year: 2026, exemption: "Granted", petitionDeadline: "" }], NOW).map(
        (e) => e.uid,
      ),
    ).toEqual(["tax-P1-trim-2027"]);

    // A saved petition deadline replaces that year's TRIM reminder.
    const saved = floridaTaxEvents(
      "P1",
      "",
      "FL",
      [
        { year: 2027, exemption: "Granted", petitionDeadline: "2027-09-15" },
        { year: 2026, exemption: "Granted", petitionDeadline: "2026-09-12" },
      ],
      NOW,
    );
    expect(saved.map((e) => [e.uid, e.date])).toEqual([["tax-P1-petition-2027", "2027-09-15"]]);
    expect(saved[0].title).toBe("Property tax petition deadline");

    expect(floridaTaxEvents("P1", "", "GA", [], NOW)).toEqual([]);
  });
});

describe("collectCalendarEvents with insurance and taxes", () => {
  it("CE.9 adds insurance renewals and Florida tax deadlines", () => {
    const uids = collectCalendarEvents({
      properties: [prop("P1", "9 Basis Lane"), { ...prop("P2", "4 Oak St"), state: "GA" } as Property],
      jobs: [],
      recurring: {},
      systemAges: () => ({}),
      insurance: { P1: policy(), P2: null },
      taxYears: { P1: [] },
      now: NOW,
    }).map((e) => e.uid);
    expect(uids).toContain("insurance-P1");
    expect(uids).toContain("tax-P1-homestead-2027");
    expect(uids).toContain("tax-P1-trim-2027");
    expect(uids.some((u) => u.startsWith("tax-P2-"))).toBe(false);
    expect(uids).not.toContain("insurance-P2");
  });
});
