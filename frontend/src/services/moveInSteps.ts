/**
 * #712: the steps of a move-in plan, written from the home's own records
 * (house guide, insurance policy, appliances and their recall check, system
 * age estimates). Pure: no calls. Each step is a suggestion for the owner;
 * nothing here says a home is safe or up to code.
 *
 * A step counts as done when the household ticks it, or (for the shutoffs and
 * insurance steps) when the record already shows it: the house guide notes the
 * water shutoff and electrical panel, or a policy is on file.
 */
import type { HouseGuide } from "./houseGuide";
import type { RecallMatch } from "./recalls";
import { recallItems } from "./recalls";
import type { Room } from "./room";
import type { SystemEstimate } from "./systemAgeEstimator";
import type { MoveInPlan, MoveInTask } from "./moveInPlan";

export type StepLink = { label: string; to: string } | { label: string; href: string };

export interface MoveInStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  /** Why the step counts as done without a tick, e.g. "Policy with Citizens on record". */
  evidence?: string;
  link?: StepLink;
  /** Something on record needs a look soon (e.g. a possible recall). */
  urgent?: boolean;
}

export interface StepInput {
  propertyId: string;
  city: string;
  state: string;
  plan: MoveInPlan;
  guide: HouseGuide | null;
  /** The carrier of the policy on record, or null when there is none. */
  insuranceCarrier: string | null;
  rooms: Room[];
  /** The CPSC check of the appliances on record; null while it runs or when it failed. */
  recalls: RecallMatch[] | null;
  systems: SystemEstimate[];
}

/**
 * The year a Florida buyer can first get the homestead exemption: the home
 * must be their permanent residence on January 1 of that year, and they file
 * by March 1 of it (Fla. Stat. 196.011). A home bought during a year is first
 * eligible the next year.
 */
export function homesteadFilingYear(startedAtMs: number): number {
  return new Date(startedAtMs).getUTCFullYear() + 1;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function homesteadStep(input: StepInput): Omit<MoveInStep, "done"> {
  const search = (q: string) => ({
    label: "Find your property appraiser",
    href: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  });
  if (input.state.toUpperCase() === "FL") {
    const y = homesteadFilingYear(input.plan.startedAt);
    return {
      id: "homestead",
      title: "File for the Florida homestead exemption",
      detail:
        `If this is your permanent home on January 1, ${y}, file with your county property appraiser by March 1, ${y}. ` +
        "The exemption lowers the taxable value and caps yearly increases. The appraiser's site has the form and the rules.",
      link: search(`${input.city} FL county property appraiser homestead exemption`),
    };
  }
  return {
    id: "homestead",
    title: "Ask about a homestead exemption",
    detail:
      "Many states lower property tax on a primary residence. Ask your county assessor or property appraiser whether one applies and how to file.",
    link: search(`${input.city} ${input.state} property tax homestead exemption`),
  };
}

function recallStep(input: StepInput): Omit<MoveInStep, "done"> {
  const base = { id: "recalls", title: "Check appliances for safety recalls" };
  const items = recallItems(input.rooms);
  if (items.length === 0) {
    return {
      ...base,
      detail:
        "Add your appliances' brand and model numbers (Rooms tab, or scan the label) and HomeGentic checks them against CPSC recalls.",
      link: { label: "Add appliances", to: `/properties/${input.propertyId}?tab=rooms` },
    };
  }
  if (input.recalls === null) {
    return {
      ...base,
      detail: `We couldn't check the ${items.length} ${plural(items.length, "model number", "model numbers")} on record against CPSC recalls just now. Try again later.`,
    };
  }
  const hit = input.recalls.find((m) => m.recalls.length > 0);
  if (hit) {
    const notice = hit.recalls[0];
    return {
      ...base,
      urgent: true,
      detail: `A recall may cover your ${hit.brand} ${hit.model}${notice.title ? `: ${notice.title}` : ""}. Compare the model number on the notice with the appliance's label.`,
      ...(notice.url ? { link: { label: "Read the CPSC notice", href: notice.url } } : {}),
    };
  }
  return {
    ...base,
    detail: `No CPSC recall matched the ${items.length} ${plural(items.length, "model number", "model numbers")} on record. Add any appliances that are missing.`,
  };
}

function systemsStep(input: StepInput): Omit<MoveInStep, "done"> {
  const late = input.systems
    .filter((s) => s.urgency === "Critical" || s.urgency === "Soon")
    .sort((a, b) => a.yearsRemaining - b.yearsRemaining)
    .map((s) => s.systemName.toLowerCase());
  const named =
    late.length === 0
      ? "None of the big systems looks near the end of its expected life from the estimate."
      : `From the estimate, your ${late.slice(0, 3).join(", ")} may be near the end of ${plural(late.length, "its", "their")} expected life.`;
  return {
    id: "systems",
    title: "Confirm the ages of the big systems",
    detail: `${named} The estimate starts from the year the home was built; set the real install years from labels, receipts or the inspection so reminders are right.`,
    link: { label: "Check system ages", to: `/properties/${input.propertyId}/systems` },
  };
}

export function buildMoveInSteps(input: StepInput): MoveInStep[] {
  const pid = input.propertyId;
  const g = input.guide;
  const shutoffsNoted = !!g && g.waterShutoff.trim() !== "" && g.electricPanel.trim() !== "";
  const carrier = input.insuranceCarrier?.trim() || null;

  const steps: Array<Omit<MoveInStep, "done"> & { auto?: boolean }> = [
    {
      id: "locks",
      title: "Change or rekey the locks",
      detail:
        "Previous owners, agents and contractors may still have keys or codes. Rekey the outside doors and change the garage door and keypad codes.",
    },
    {
      id: "shutoffs",
      title: "Find the water, gas and electrical shutoffs",
      detail:
        "Find the main water shutoff, the gas meter valve (if the home has gas) and the electrical panel, and note them in the house guide so anyone can find them in a hurry.",
      link: { label: "Open the house guide", to: `/properties/${pid}?tab=guide` },
      ...(shutoffsNoted ? { auto: true, evidence: "Water shutoff and electrical panel noted in the house guide" } : {}),
    },
    {
      id: "alarms",
      title: "Test the smoke and carbon monoxide alarms",
      detail:
        "Press each alarm's test button, replace batteries, and check the date on the back: most alarms should be replaced after 10 years.",
    },
    {
      id: "insurance",
      title: "Put your home insurance on record",
      detail:
        "Add the carrier, policy number and renewal date so HomeGentic can remind you before renewal and you have it to hand if you need to file a claim.",
      link: { label: "Open insurance", to: `/properties/${pid}?tab=insurance` },
      ...(carrier ? { auto: true, evidence: `Policy with ${carrier} on record` } : {}),
    },
    {
      id: "utilities",
      title: "Move the utilities into your name",
      detail:
        "Electric, water and sewer, gas, trash and internet. Log the first bills here to track usage from day one.",
      link: { label: "Open bills", to: `/properties/${pid}?tab=bills` },
    },
    homesteadStep(input),
    recallStep(input),
    {
      id: "filters",
      title: "Change the HVAC filter and note its size",
      detail:
        "The size is printed on the filter's edge. Write it down (Rooms tab, or the house guide) so the next one is easy to buy.",
      link: { label: "Open rooms", to: `/properties/${pid}?tab=rooms` },
    },
    systemsStep(input),
    {
      id: "inspection",
      title: "Turn your inspection report into a repair list",
      detail:
        "Upload the inspection report from your purchase. HomeGentic lists what the inspector flagged, and you choose which items to add as tasks below.",
    },
  ];

  const ticked = new Set(input.plan.doneSteps);
  return steps.map(({ auto, ...s }) => ({ ...s, done: ticked.has(s.id) || !!auto }));
}

export function moveInProgress(plan: MoveInPlan, steps: MoveInStep[]): { done: number; total: number } {
  const ticked = new Set(plan.doneSteps);
  const done = steps.filter((s) => s.done).length + plan.tasks.filter((t) => ticked.has(t.id)).length;
  return { done, total: steps.length + plan.tasks.length };
}

const AREA_SERVICE: Record<string, string> = {
  roof: "Roofing",
  roofing: "Roofing",
  hvac: "HVAC",
  heating: "HVAC",
  cooling: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  foundation: "Foundation",
  structure: "Foundation",
  gutters: "Gutters",
  windows: "Windows",
  insulation: "Insulation",
  pool: "Pool",
};

/** What the quote request form is pre-filled with for a task. */
export function quotePrefillFor(propertyId: string, task: MoveInTask): Record<string, string> {
  const serviceType = AREA_SERVICE[task.area.trim().toLowerCase()];
  const what = task.detail ? `${task.title}. ${task.detail}` : task.title;
  return {
    propertyId,
    ...(serviceType ? { serviceType } : {}),
    description: `${what} (from my purchase inspection)`,
  };
}
