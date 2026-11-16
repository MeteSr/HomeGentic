/**
 * Per-property system install years.
 *
 * The home record keeps them (property canister setSystemYears /
 * getSystemYears), so the weekly email, the mobile app and every browser use
 * what the owner entered. localStorage holds this browser's copy, which the
 * synchronous get() reads: load() refreshes it from the record, and moves
 * years an older version saved only in this browser up to the record once.
 *
 * Each system can have an explicit install year set by the user.
 * When absent, the prediction engine falls back to the property's yearBuilt.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import { canisterError } from "./candid";

const getActor = lazyActor<PropertyCanister>(idlFactory, () => (process.env as any).PROPERTY_CANISTER_ID || "");

export const TRACKED_SYSTEMS = [
  "HVAC",
  "Roofing",
  "Water Heater",
  "Windows",
  "Electrical",
  "Plumbing",
  "Flooring",
  "Insulation",
  "Solar Panels",
] as const;

export type SystemName = typeof TRACKED_SYSTEMS[number];

/** Record<systemName, installYear> — only the systems the user has set. */
export type SystemAges = Partial<Record<SystemName, number>>;

const storageKey = (propertyId: string) => `homegentic_system_ages_${propertyId}`;

export const systemAgesService = {
  get(propertyId: string): SystemAges {
    try {
      const raw = localStorage.getItem(storageKey(propertyId));
      return raw ? (JSON.parse(raw) as SystemAges) : {};
    } catch {
      return {};
    }
  },

  set(propertyId: string, ages: SystemAges): void {
    localStorage.setItem(storageKey(propertyId), JSON.stringify(ages));
  },

  /**
   * The years on the home record, also kept as this browser's copy. When the
   * record has none but this browser does (saved before years moved to the
   * record), the ones the record accepts are saved there. Falls back to this
   * browser's copy when the record can't be read.
   */
  async load(propertyId: string, yearBuilt = 0): Promise<SystemAges> {
    const local = tracked(this.get(propertyId));
    if (!(process.env as any).PROPERTY_CANISTER_ID) return local;
    try {
      const res = await (await getActor()).getSystemYears(propertyId);
      if ("err" in res) return local;
      if (res.ok.length > 0) {
        const fromRecord = fromCanister(res.ok);
        this.set(propertyId, fromRecord);
        return fromRecord;
      }
      const movable: SystemAges = {};
      const thisYear = new Date().getFullYear();
      for (const [name, year] of Object.entries(local) as [SystemName, number][]) {
        if (year >= yearBuilt && year <= thisYear) movable[name] = year;
      }
      if (Object.keys(movable).length === 0) return local;
      return await this.save(propertyId, movable);
    } catch {
      return local;
    }
  },

  /** Replace the home's years on the record and in this browser. Throws the record's error. */
  async save(propertyId: string, ages: SystemAges): Promise<SystemAges> {
    const clean = tracked(ages);
    if ((process.env as any).PROPERTY_CANISTER_ID) {
      const years = (Object.entries(clean) as [SystemName, number][]).map(([name, year]) => ({
        name, installYear: BigInt(year),
      }));
      const res = await (await getActor()).setSystemYears(propertyId, years);
      if ("err" in res) throw canisterError(res.err);
    }
    this.set(propertyId, clean);
    return clean;
  },

  /** True when at least one system has been explicitly set. */
  hasAny(propertyId: string): boolean {
    return Object.keys(this.get(propertyId)).length > 0;
  },
};

/** Only the systems we track, with whole-number years. */
function tracked(ages: SystemAges | Record<string, unknown>): SystemAges {
  const out: SystemAges = {};
  for (const name of TRACKED_SYSTEMS) {
    const y = (ages as Record<string, unknown>)[name];
    if (typeof y === "number" && Number.isInteger(y)) out[name] = y;
  }
  return out;
}

function fromCanister(years: readonly { name: string; installYear: bigint }[]): SystemAges {
  const out: Record<string, number> = {};
  for (const y of years) out[y.name] = Number(y.installYear);
  return tracked(out);
}
