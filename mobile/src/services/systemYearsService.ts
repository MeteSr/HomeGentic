import { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import { actorFor, unwrap } from "./canister";

const PROPERTY_CANISTER_ID = process.env.EXPO_PUBLIC_PROPERTY_CANISTER_ID ?? "";

/** The systems the add-home form asks about, as the web wizard does (names as the property canister stores them). */
export const SYSTEMS: { name: string; label: string; replacedLabel: string }[] = [
  { name: "HVAC", label: "HVAC / AC", replacedLabel: "Replaced" },
  { name: "Roofing", label: "Roof", replacedLabel: "Replaced" },
  { name: "Water Heater", label: "Water Heater", replacedLabel: "Replaced" },
  { name: "Electrical", label: "Electrical Panel", replacedLabel: "Replaced" },
  { name: "Plumbing", label: "Plumbing", replacedLabel: "Replaced" },
  { name: "Solar Panels", label: "Solar Panels", replacedLabel: "Installed" },
];

/** Solar isn't original to a house: it's either installed in a year or absent. */
export const NO_ORIGINAL = new Set(["Solar Panels"]);

export type YearChoice = { choice: "original" | "replaced" | null; year: string };
export type SystemYears = Record<string, number>;

/**
 * Pure — what the form saves: Original at the build year, Replaced at the
 * year given, unanswered systems left out. Throws a message for the person
 * when a replaced year is missing or out of range.
 */
export function yearsToSave(
  answers: Record<string, YearChoice>,
  yearBuilt: number,
  currentYear = new Date().getFullYear(),
): SystemYears {
  const out: SystemYears = {};
  for (const { name, label } of SYSTEMS) {
    const a = answers[name];
    if (!a || a.choice === null) continue;
    if (a.choice === "original") {
      out[name] = yearBuilt;
      continue;
    }
    const y = Number(a.year.trim());
    if (!a.year.trim() || !Number.isInteger(y)) throw new Error(`Enter the year the ${label} was replaced.`);
    if (y < yearBuilt) throw new Error(`The ${label} year can't be before ${yearBuilt}, when the house was built.`);
    if (y > currentYear) throw new Error(`The ${label} year can't be after ${currentYear}.`);
    out[name] = y;
  }
  return out;
}

function actor(agent?: HttpAgent) {
  return actorFor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID, agent);
}

/** Save the years on the home record (replaces what was there). */
export async function saveSystemYears(propertyId: string, years: SystemYears, agent?: HttpAgent): Promise<void> {
  unwrap(
    await actor(agent).setSystemYears(
      propertyId,
      Object.entries(years).map(([name, y]) => ({ name, installYear: BigInt(y) })),
    ),
  );
}

/** The years saved on the home record. */
export async function getSystemYears(propertyId: string, agent?: HttpAgent): Promise<SystemYears> {
  const rows = unwrap(await actor(agent).getSystemYears(propertyId));
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.installYear)]));
}
