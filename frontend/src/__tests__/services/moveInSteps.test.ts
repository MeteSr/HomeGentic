/**
 * #712: the move-in steps the app writes from the home's own records. Every
 * step is a suggestion; nothing here says a home is safe or up to code.
 */
import { describe, it, expect } from "vitest";
import {
  buildMoveInSteps,
  moveInProgress,
  homesteadFilingYear,
  quotePrefillFor,
  type StepInput,
} from "@/services/moveInSteps";
import type { MoveInPlan } from "@/services/moveInPlan";
import { EMPTY_GUIDE } from "@/services/houseGuide";
import type { Room } from "@/services/room";
import type { SystemEstimate } from "@/services/systemAgeEstimator";

const NOV_2026 = Date.UTC(2026, 10, 7);
const plan = (over: Partial<MoveInPlan> = {}): MoveInPlan => ({
  startedAt: NOV_2026,
  doneSteps: [],
  tasks: [],
  updatedAt: NOV_2026,
  ...over,
});
const room = (fixtures: Array<{ brand: string; model: string }>): Room =>
  ({
    id: "r1",
    propertyId: "p1",
    owner: "o",
    name: "Kitchen",
    floorName: "",
    floorType: "",
    paintColor: "",
    paintBrand: "",
    paintCode: "",
    notes: "",
    createdAt: 0n,
    updatedAt: 0n,
    fixtures: fixtures.map((f, i) => ({
      id: `f${i}`,
      ...f,
      serialNumber: "",
      installedDate: "",
      warrantyExpiry: "",
      notes: "",
    })),
  }) as Room;
const system = (over: Partial<SystemEstimate>): SystemEstimate => ({
  systemName: "Water Heater",
  installYear: 2012,
  ageYears: 14,
  lifespanYears: 12,
  percentLifeUsed: 115,
  yearsRemaining: -2,
  urgency: "Critical",
  replacementCostLow: 1200,
  replacementCostHigh: 2500,
  ...over,
});
const input = (over: Partial<StepInput> = {}): StepInput => ({
  propertyId: "p1",
  city: "Orlando",
  state: "FL",
  plan: plan(),
  guide: null,
  insuranceCarrier: null,
  rooms: [],
  recalls: null,
  systems: [],
  ...over,
});
const step = (steps: ReturnType<typeof buildMoveInSteps>, id: string) => steps.find((s) => s.id === id)!;

describe("buildMoveInSteps", () => {
  it("lists the first-weeks steps in a fixed order", () => {
    expect(buildMoveInSteps(input()).map((s) => s.id)).toEqual([
      "locks",
      "shutoffs",
      "alarms",
      "insurance",
      "utilities",
      "homestead",
      "recalls",
      "filters",
      "systems",
      "inspection",
    ]);
  });

  it("marks steps the household ticked", () => {
    const steps = buildMoveInSteps(input({ plan: plan({ doneSteps: ["locks", "alarms"] }) }));
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["locks", "alarms"]);
  });

  it("counts shutoffs as done once the house guide notes the water shutoff and electrical panel", () => {
    expect(step(buildMoveInSteps(input()), "shutoffs").done).toBe(false);
    const partial = { ...EMPTY_GUIDE, waterShutoff: "Front yard, by the meter" };
    expect(step(buildMoveInSteps(input({ guide: partial })), "shutoffs").done).toBe(false);
    const s = step(buildMoveInSteps(input({ guide: { ...partial, electricPanel: "Garage, left wall" } })), "shutoffs");
    expect(s.done).toBe(true);
    expect(s.evidence).toMatch(/house guide/i);
    expect(s.link).toEqual({ label: "Open the house guide", to: "/properties/p1?tab=guide" });
  });

  it("counts insurance as done when a policy is on record", () => {
    expect(step(buildMoveInSteps(input()), "insurance").done).toBe(false);
    const s = step(buildMoveInSteps(input({ insuranceCarrier: "Citizens" })), "insurance");
    expect(s.done).toBe(true);
    expect(s.evidence).toBe("Policy with Citizens on record");
  });

  it("gives Florida owners the homestead deadline and no deadline elsewhere", () => {
    const fl = step(buildMoveInSteps(input()), "homestead");
    expect(fl.title).toBe("File for the Florida homestead exemption");
    expect(fl.detail).toContain("January 1, 2027");
    expect(fl.detail).toContain("March 1, 2027");
    expect(fl.link && "href" in fl.link && fl.link.href).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);

    const ga = step(buildMoveInSteps(input({ state: "GA", city: "Atlanta" })), "homestead");
    expect(ga.title).toBe("Ask about a homestead exemption");
    expect(ga.detail).not.toMatch(/March|January/);
  });

  it("reports the recall check honestly", () => {
    expect(step(buildMoveInSteps(input()), "recalls").detail).toMatch(/Add your appliances' brand and model/);

    const rooms = [
      room([
        { brand: "LG", model: "LRMVS3006S" },
        { brand: "Rheem", model: "XE50" },
      ]),
    ];
    expect(step(buildMoveInSteps(input({ rooms, recalls: null })), "recalls").detail).toMatch(
      /couldn't check|checking/i,
    );
    expect(step(buildMoveInSteps(input({ rooms, recalls: [] })), "recalls").detail).toBe(
      "No CPSC recall matched the 2 model numbers on record. Add any appliances that are missing.",
    );
    const hit = step(
      buildMoveInSteps(
        input({
          rooms,
          recalls: [
            {
              brand: "LG",
              model: "LRMVS3006S",
              recalls: [
                {
                  id: "1",
                  number: "24-001",
                  date: "2024-01-01",
                  title: "Fridge recall",
                  url: "https://cpsc.gov/x",
                  hazard: "",
                  remedy: "",
                },
              ],
            },
          ],
        }),
      ),
      "recalls",
    );
    expect(hit.detail).toMatch(/may cover your LG LRMVS3006S/);
    expect(hit.link).toEqual({ label: "Read the CPSC notice", href: "https://cpsc.gov/x" });
    expect(hit.urgent).toBe(true);
  });

  it("names systems near the end of their expected life, as an estimate", () => {
    const s = step(
      buildMoveInSteps(
        input({ systems: [system({}), system({ systemName: "Roof", urgency: "Good", yearsRemaining: 10 })] }),
      ),
      "systems",
    );
    expect(s.detail).toMatch(/water heater/i);
    expect(s.detail).not.toMatch(/roof/i);
    expect(s.detail).toMatch(/estimate/i);
    expect(s.link).toEqual({ label: "Check system ages", to: "/properties/p1/systems" });
  });

  it("never claims the home is safe or up to code", () => {
    const all = buildMoveInSteps(input({ rooms: [room([{ brand: "LG", model: "X" }])], recalls: [] }))
      .map((s) => `${s.title} ${s.detail} ${s.evidence ?? ""}`)
      .join(" ");
    expect(all).not.toMatch(/\bis safe\b|up to code|code[- ]compliant|passed/i);
  });
});

describe("homesteadFilingYear", () => {
  it("is the year after the plan started", () => {
    expect(homesteadFilingYear(NOV_2026)).toBe(2027);
    expect(homesteadFilingYear(Date.UTC(2027, 0, 15))).toBe(2028);
  });
});

describe("moveInProgress", () => {
  it("counts steps and tasks", () => {
    const p = plan({
      doneSteps: ["locks", "mt-1"],
      tasks: [
        { id: "mt-1", title: "A", detail: "", area: "", urgency: "repair", createdAt: 0 },
        { id: "mt-2", title: "B", detail: "", area: "", urgency: "safety", createdAt: 0 },
      ],
    });
    const steps = buildMoveInSteps(input({ plan: p, insuranceCarrier: "Citizens" }));
    expect(moveInProgress(p, steps)).toEqual({ done: 3, total: 12 });
  });
});

describe("quotePrefillFor", () => {
  it("maps the area of the home to a service type where one fits", () => {
    const t = {
      id: "mt-1",
      title: "Repair flashing",
      detail: "At chimney",
      area: "Roof",
      urgency: "repair" as const,
      createdAt: 0,
    };
    expect(quotePrefillFor("p1", t)).toEqual({
      propertyId: "p1",
      serviceType: "Roofing",
      description: "Repair flashing. At chimney (from my purchase inspection)",
    });
    expect(quotePrefillFor("p1", { ...t, area: "Attic", detail: "" })).toEqual({
      propertyId: "p1",
      description: "Repair flashing (from my purchase inspection)",
    });
  });
});
