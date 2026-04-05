/**
 * Per-property system install years — stored in localStorage.
 *
 * Each system can have an explicit install year set by the user.
 * When absent, the prediction engine falls back to the property's yearBuilt.
 */

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

  /** True when at least one system has been explicitly set. */
  hasAny(propertyId: string): boolean {
    return Object.keys(this.get(propertyId)).length > 0;
  },
};
