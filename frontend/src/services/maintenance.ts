/**
 * Maintenance prediction service.
 * `predict()` runs client-side (deterministic, no canister needed).
 * Schedule CRUD is wired to the maintenance canister when MAINTENANCE_CANISTER_ID is set.
 */

import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";
import type { Job } from "./job";

const MAINTENANCE_CANISTER_ID = (process.env as any).MAINTENANCE_CANISTER_ID || "";

// ─── IDL (schedule methods only) ─────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const ScheduleEntry = IDL.Record({
    id:                 IDL.Text,
    propertyId:         IDL.Text,
    systemName:         IDL.Text,
    taskDescription:    IDL.Text,
    plannedYear:        IDL.Nat,
    plannedMonth:       IDL.Opt(IDL.Nat),
    estimatedCostCents: IDL.Opt(IDL.Nat),
    isCompleted:        IDL.Bool,
    createdBy:          IDL.Principal,
    createdAt:          IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    Unauthorized: IDL.Null,
    InvalidInput: IDL.Text,
  });
  return IDL.Service({
    createScheduleEntry: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
    getScheduleByProperty: IDL.Func([IDL.Text], [IDL.Vec(ScheduleEntry)], ["query"]),
    markCompleted: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: ScheduleEntry, err: Error })],
      []
    ),
  });
};

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: MAINTENANCE_CANISTER_ID });
  }
  return _actor;
}

function fromEntry(raw: any): ScheduleEntry {
  return {
    id:                 raw.id,
    propertyId:         raw.propertyId,
    systemName:         raw.systemName,
    taskDescription:    raw.taskDescription,
    plannedYear:        Number(raw.plannedYear),
    plannedMonth:       raw.plannedMonth[0] !== undefined ? Number(raw.plannedMonth[0]) : undefined,
    estimatedCostCents: raw.estimatedCostCents[0] !== undefined ? Number(raw.estimatedCostCents[0]) : undefined,
    isCompleted:        raw.isCompleted,
    createdAt:          Number(raw.createdAt) / 1_000_000,
  };
}

// ─── Material Specs (1.1.6) ──────────────────────────────────────────────────
//
// Per-system material keys with lifespan multipliers relative to the baseline.
// Multipliers > 1.0 extend lifespan; < 1.0 shorten it.
// These stack with climate multipliers inside predictMaintenance.

export interface MaterialSpec {
  label: string;
  multiplier: number;
}

export const MATERIAL_SPECS: Record<string, Record<string, MaterialSpec>> = {
  Roofing: {
    asphalt:   { label: "Asphalt Shingles",       multiplier: 1.0  },
    metal:     { label: "Metal",                   multiplier: 1.6  },
    tile:      { label: "Clay/Concrete Tile",      multiplier: 2.0  },
    woodShake: { label: "Wood Shake",              multiplier: 0.80 },
    slate:     { label: "Slate",                   multiplier: 2.4  },
  },
  Flooring: {
    hardwood:  { label: "Hardwood",                multiplier: 1.0  },
    carpet:    { label: "Carpet",                  multiplier: 0.40 },
    lvp:       { label: "Luxury Vinyl",            multiplier: 0.80 },
    tile:      { label: "Ceramic/Porcelain Tile",  multiplier: 1.20 },
    laminate:  { label: "Laminate",                multiplier: 0.60 },
  },
  Plumbing: {
    copper:    { label: "Copper",                  multiplier: 1.0  },
    pvc:       { label: "PVC/PEX",                 multiplier: 1.0  },
    galvanized:{ label: "Galvanized Steel",         multiplier: 0.50 },
    castIron:  { label: "Cast Iron",               multiplier: 1.40 },
  },
  Windows: {
    doublePane:{ label: "Double-Pane Vinyl",       multiplier: 1.0  },
    singlePane:{ label: "Single-Pane",             multiplier: 0.68 },
    triplePane:{ label: "Triple-Pane",             multiplier: 1.36 },
    wood:      { label: "Wood Frame",              multiplier: 0.86 },
  },
  "Water Heater": {
    tank:      { label: "Tank (Standard)",         multiplier: 1.0  },
    tankless:  { label: "Tankless",                multiplier: 1.67 },
    heatPump:  { label: "Heat Pump Water Heater",  multiplier: 1.50 },
  },
  HVAC: {
    central:   { label: "Central Air/Furnace",     multiplier: 1.0  },
    heatPump:  { label: "Heat Pump",               multiplier: 0.83 },
    miniSplit:  { label: "Mini-Split",              multiplier: 1.11 },
    boiler:    { label: "Boiler",                  multiplier: 1.33 },
  },
};

/** Returns the lifespan multiplier for a given system + material key.
 *  Falls back to 1.0 (no adjustment) for unknown systems or materials. */
export function getMaterialMultiplier(systemName: string, materialKey: string): number {
  return MATERIAL_SPECS[systemName]?.[materialKey]?.multiplier ?? 1.0;
}

// ─── Climate Zone Model ──────────────────────────────────────────────────────
//
// Five practical zones derived from DOE Building America climate zones.
// Multipliers < 1.0 shorten effective lifespan (harsher conditions).
// Only systems meaningfully affected by a zone carry a non-1.0 multiplier.

export interface ClimateZone {
  id: string;
  name: string;
  description: string;
  /** Per-system lifespan multiplier. Missing key = 1.0 (no adjustment). */
  lifespanMultipliers: Partial<Record<string, number>>;
}

const CLIMATE_ZONES: Record<string, ClimateZone> = {
  hotHumid: {
    id: "hotHumid",
    name: "Hot-Humid",
    description: "Year-round AC load, high UV, and moisture accelerate HVAC, roofing, and insulation wear.",
    lifespanMultipliers: {
      "HVAC":         0.85,   // runs year-round; humidity corrodes components
      "Roofing":      0.88,   // UV + humidity + mold
      "Water Heater": 0.90,   // mineral buildup, ambient heat
      "Windows":      0.90,   // UV, humidity-driven seal failure
      "Insulation":   0.85,   // moisture intrusion over time
    },
  },
  hotDry: {
    id: "hotDry",
    name: "Hot-Dry",
    description: "Intense UV and thermal cycling stress roofing and windows; expansive soils affect plumbing.",
    lifespanMultipliers: {
      "HVAC":      0.90,   // heavy cooling load but dry air is easier on components
      "Roofing":   0.92,   // intense UV, but no freeze/thaw or moisture
      "Windows":   0.90,   // UV and thermal stress
      "Plumbing":  0.90,   // expansive clay soils shift foundations
    },
  },
  cold: {
    id: "cold",
    name: "Cold",
    description: "Freeze-thaw cycles damage roofing and plumbing; heavy heating load stresses HVAC.",
    lifespanMultipliers: {
      "Roofing":    0.88,   // freeze-thaw, ice dams
      "Plumbing":   0.88,   // freezing risk, pipe stress
      "HVAC":       0.88,   // heavy heating season
      "Windows":    0.88,   // thermal cycling, condensation
      "Insulation": 0.90,   // compression from freeze-thaw
    },
  },
  veryCold: {
    id: "veryCold",
    name: "Very Cold",
    description: "Extreme winters cause accelerated wear across roofing, plumbing, HVAC, and windows.",
    lifespanMultipliers: {
      "Roofing":    0.82,
      "Plumbing":   0.83,
      "HVAC":       0.83,
      "Windows":    0.83,
      "Insulation": 0.85,
    },
  },
  mixed: {
    id: "mixed",
    name: "Mixed/Moderate",
    description: "Moderate climate — national average lifespans apply.",
    lifespanMultipliers: {},
  },
};

/** Map US state abbreviations to a climate zone. */
const STATE_TO_ZONE: Record<string, keyof typeof CLIMATE_ZONES> = {
  // Hot-Humid
  FL: "hotHumid", LA: "hotHumid", MS: "hotHumid", AL: "hotHumid",
  GA: "hotHumid", SC: "hotHumid", HI: "hotHumid",
  // Hot-Dry
  AZ: "hotDry", NM: "hotDry", NV: "hotDry", UT: "hotDry",
  // Very Cold
  MN: "veryCold", ND: "veryCold", SD: "veryCold", WI: "veryCold",
  AK: "veryCold", ME: "veryCold", VT: "veryCold", NH: "veryCold",
  // Cold
  MI: "cold", WY: "cold", MT: "cold", ID: "cold", CO: "cold",
  IA: "cold", NE: "cold", KS: "cold", MO: "cold", IL: "cold",
  IN: "cold", OH: "cold", PA: "cold", NY: "cold", MA: "cold",
  RI: "cold", CT: "cold", NJ: "cold", WV: "cold",
  // Everything else → mixed
};

export function getClimateZone(state: string): ClimateZone {
  const zoneKey = STATE_TO_ZONE[state.toUpperCase().trim()];
  return CLIMATE_ZONES[zoneKey ?? "mixed"];
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type UrgencyLevel = "Critical" | "Soon" | "Watch" | "Good";

export interface SystemPrediction {
  systemName: string;
  lastServiceYear: number;
  percentLifeUsed: number;
  yearsRemaining: number;
  urgency: UrgencyLevel;
  estimatedCostLowCents: number;     // full replacement cost
  estimatedCostHighCents: number;    // full replacement cost
  serviceCallLowCents: number;       // routine service / inspection cost
  serviceCallHighCents: number;      // routine service / inspection cost
  recommendation: string;
  diyViable: boolean;
  materialMultiplier: number;        // 1.0 if no material override applied
}

export interface AnnualTask {
  task: string;
  frequency: string;
  season: string | null;
  estimatedCost: string;
  estimatedCostLowCents: number;
  estimatedCostHighCents: number;
  diyViable: boolean;
}

export interface MaintenanceReport {
  systemPredictions: SystemPrediction[];
  annualTasks: AnnualTask[];
  totalBudgetLowCents: number;
  totalBudgetHighCents: number;
  annualTaskBudgetLowCents: number;
  annualTaskBudgetHighCents: number;
  climateZone: ClimateZone;
  generatedAt: number;
  materialOverrides: Partial<Record<string, string>>;
}

export interface ScheduleEntry {
  id: string;
  propertyId: string;
  systemName: string;
  taskDescription: string;
  plannedYear: number;
  plannedMonth?: number;
  estimatedCostCents?: number;
  isCompleted: boolean;
  createdAt: number;
}

// ─── Embedded System Tables (mirrors SYSTEMS in main.mo) ────────────────────

interface SystemSpec {
  name: string;
  lifespanYears: number;
  costLowCents: number;
  costHighCents: number;
  serviceCallLowCents: number;   // routine inspection / tune-up (not replacement)
  serviceCallHighCents: number;
  diyViable: boolean;
}

const SYSTEMS: SystemSpec[] = [
  { name: "HVAC",         lifespanYears: 18, costLowCents:  800_000, costHighCents: 1_500_000, serviceCallLowCents:  8_000, serviceCallHighCents:  20_000, diyViable: false },
  { name: "Roofing",      lifespanYears: 25, costLowCents: 1_500_000, costHighCents: 3_500_000, serviceCallLowCents: 15_000, serviceCallHighCents:  40_000, diyViable: false },
  { name: "Water Heater", lifespanYears: 12, costLowCents:  120_000, costHighCents:   350_000, serviceCallLowCents:  5_000, serviceCallHighCents:  15_000, diyViable: false },
  { name: "Windows",      lifespanYears: 22, costLowCents:  800_000, costHighCents: 2_400_000, serviceCallLowCents:  5_000, serviceCallHighCents:  20_000, diyViable: false },
  { name: "Electrical",   lifespanYears: 35, costLowCents:  200_000, costHighCents:   600_000, serviceCallLowCents: 10_000, serviceCallHighCents:  30_000, diyViable: false },
  { name: "Plumbing",     lifespanYears: 50, costLowCents:  400_000, costHighCents: 1_500_000, serviceCallLowCents: 10_000, serviceCallHighCents:  35_000, diyViable: false },
  { name: "Flooring",     lifespanYears: 25, costLowCents:  300_000, costHighCents: 2_000_000, serviceCallLowCents: 10_000, serviceCallHighCents:  50_000, diyViable: true  },
  { name: "Insulation",   lifespanYears: 30, costLowCents:  150_000, costHighCents:   500_000, serviceCallLowCents: 10_000, serviceCallHighCents:  30_000, diyViable: true  },
  { name: "Solar Panels", lifespanYears: 25, costLowCents: 1_500_000, costHighCents: 3_500_000, serviceCallLowCents: 15_000, serviceCallHighCents:  40_000, diyViable: false },
];

const ANNUAL_TASKS: AnnualTask[] = [
  { task: "Replace HVAC air filter",            frequency: "Quarterly",     season: null,     estimatedCost: "$10–$30 (DIY)",  estimatedCostLowCents:  1_000, estimatedCostHighCents:  3_000, diyViable: true  },
  { task: "Clean gutters",                       frequency: "Semi-annually", season: "Fall",   estimatedCost: "$100–$250",       estimatedCostLowCents: 10_000, estimatedCostHighCents: 25_000, diyViable: true  },
  { task: "Clean dryer vent",                    frequency: "Annually",      season: null,     estimatedCost: "$0–$150",         estimatedCostLowCents:     0, estimatedCostHighCents: 15_000, diyViable: true  },
  { task: "Flush water heater",                  frequency: "Annually",      season: null,     estimatedCost: "$0 (DIY)",        estimatedCostLowCents:     0, estimatedCostHighCents:  5_000, diyViable: true  },
  { task: "Test smoke & CO detectors",           frequency: "Annually",      season: null,     estimatedCost: "$0 (DIY)",        estimatedCostLowCents:     0, estimatedCostHighCents:  2_000, diyViable: true  },
  { task: "Inspect roof for damage",             frequency: "Annually",      season: "Spring", estimatedCost: "$0–$300",         estimatedCostLowCents:     0, estimatedCostHighCents: 30_000, diyViable: true  },
  { task: "Check weatherstripping & caulk",      frequency: "Annually",      season: "Fall",   estimatedCost: "$20–$80 (DIY)",  estimatedCostLowCents:  2_000, estimatedCostHighCents:  8_000, diyViable: true  },
  { task: "Service garage door springs/tracks",  frequency: "Annually",      season: null,     estimatedCost: "$0–$200",         estimatedCostLowCents:     0, estimatedCostHighCents: 20_000, diyViable: true  },
  { task: "HVAC professional tune-up",           frequency: "Annually",      season: "Spring", estimatedCost: "$80–$150",        estimatedCostLowCents:  8_000, estimatedCostHighCents: 15_000, diyViable: false },
  { task: "Chimney inspection & cleaning",       frequency: "Annually",      season: "Fall",   estimatedCost: "$150–$350",       estimatedCostLowCents: 15_000, estimatedCostHighCents: 35_000, diyViable: false },
];

// ─── Prediction Engine ───────────────────────────────────────────────────────

function currentYear(): number {
  return new Date().getFullYear();
}

function urgencyFor(pctUsed: number): UrgencyLevel {
  if (pctUsed >= 100) return "Critical";
  if (pctUsed >= 75)  return "Soon";
  if (pctUsed >= 50)  return "Watch";
  return "Good";
}

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  Critical: 0,
  Soon:     1,
  Watch:    2,
  Good:     3,
};

function recommendationFor(
  sys: SystemSpec,
  urgency: UrgencyLevel,
  yearsRemaining: number
): string {
  const low  = `$${Math.round(sys.costLowCents  / 100).toLocaleString()}`;
  const high = `$${Math.round(sys.costHighCents / 100).toLocaleString()}`;
  switch (urgency) {
    case "Critical":
      return `⚠️ ${sys.name} is past expected lifespan. Budget ${low}–${high} and plan replacement immediately.`;
    case "Soon":
      return `📅 ${sys.name} has roughly ${yearsRemaining} year(s) remaining. Start saving now — typical cost ${low}–${high}.`;
    case "Watch":
      return `👁 ${sys.name} is in good shape but worth monitoring. Schedule routine inspection every 2–3 years.`;
    default:
      return `✅ ${sys.name} is well within expected lifespan. No action needed.`;
  }
}

export function predictMaintenance(
  yearBuilt: number,
  jobs: Job[],
  systemInstallYears: Partial<Record<string, number>> = {},
  state?: string,
  materialOverrides: Partial<Record<string, string>> = {}
): MaintenanceReport {
  const year  = currentYear();
  const zone  = state ? getClimateZone(state) : CLIMATE_ZONES.mixed;
  let predictions: SystemPrediction[] = [];
  let budgetLow  = 0;
  let budgetHigh = 0;

  for (const sys of SYSTEMS) {
    // Use an explicit install year if the user set one, otherwise fall back to yearBuilt
    let lastYear = systemInstallYears[sys.name] ?? yearBuilt;
    for (const job of jobs) {
      const jobYear = new Date(job.date).getFullYear();
      if (job.serviceType === sys.name && jobYear > lastYear) {
        lastYear = jobYear;
      }
    }

    // Apply climate multiplier then material multiplier to effective lifespan
    const climateMultiplier  = zone.lifespanMultipliers[sys.name] ?? 1.0;
    const matKey             = materialOverrides[sys.name] ?? "";
    const materialMult       = getMaterialMultiplier(sys.name, matKey);
    const effectiveLifespan  = Math.round(sys.lifespanYears * climateMultiplier * materialMult);

    const age       = Math.max(0, year - lastYear);
    const pctUsed   = Math.round((age / effectiveLifespan) * 100);
    const remaining = effectiveLifespan - age;
    const urgency   = urgencyFor(pctUsed);

    predictions.push({
      systemName:             sys.name,
      lastServiceYear:        lastYear,
      percentLifeUsed:        pctUsed,
      yearsRemaining:         remaining,
      urgency,
      estimatedCostLowCents:  sys.costLowCents,
      estimatedCostHighCents: sys.costHighCents,
      serviceCallLowCents:    sys.serviceCallLowCents,
      serviceCallHighCents:   sys.serviceCallHighCents,
      recommendation:         recommendationFor(sys, urgency, remaining),
      diyViable:              sys.diyViable,
      materialMultiplier:     materialMult,
    });

    if (urgency === "Critical" || urgency === "Soon") {
      budgetLow  += sys.costLowCents;
      budgetHigh += sys.costHighCents;
    }
  }

  // Sort Critical → Soon → Watch → Good
  predictions.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);

  const annualLow  = ANNUAL_TASKS.reduce((s, t) => s + t.estimatedCostLowCents,  0);
  const annualHigh = ANNUAL_TASKS.reduce((s, t) => s + t.estimatedCostHighCents, 0);

  return {
    systemPredictions:         predictions,
    annualTasks:               ANNUAL_TASKS,
    totalBudgetLowCents:       budgetLow,
    totalBudgetHighCents:      budgetHigh,
    annualTaskBudgetLowCents:  annualLow,
    annualTaskBudgetHighCents: annualHigh,
    climateZone:               zone,
    generatedAt:               Date.now(),
    materialOverrides,
  };
}

// ─── Mock fallback for schedule store ────────────────────────────────────────

const scheduleStore = new Map<string, ScheduleEntry>();
let scheduleCounter = 0;

export const maintenanceService = {
  predict(yearBuilt: number, jobs: Job[], systemInstallYears?: Partial<Record<string, number>>, state?: string, materialOverrides?: Partial<Record<string, string>>): MaintenanceReport {
    return predictMaintenance(yearBuilt, jobs, systemInstallYears, state, materialOverrides);
  },

  async createScheduleEntry(
    propertyId:         string,
    systemName:         string,
    taskDescription:    string,
    plannedYear:        number,
    plannedMonth?:      number,
    estimatedCostCents?: number
  ): Promise<ScheduleEntry> {
    if (!MAINTENANCE_CANISTER_ID) {
      scheduleCounter += 1;
      const entry: ScheduleEntry = {
        id: `SCH_${scheduleCounter}`,
        propertyId, systemName, taskDescription, plannedYear,
        plannedMonth, estimatedCostCents, isCompleted: false, createdAt: Date.now(),
      };
      scheduleStore.set(entry.id, entry);
      return entry;
    }
    const a = await getActor();
    const result = await a.createScheduleEntry(
      propertyId,
      systemName,
      taskDescription,
      BigInt(plannedYear),
      plannedMonth      ? [BigInt(plannedMonth)]      : [],
      estimatedCostCents ? [BigInt(estimatedCostCents)] : []
    );
    if ("ok" in result) return fromEntry(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getScheduleByProperty(propertyId: string): Promise<ScheduleEntry[]> {
    if (!MAINTENANCE_CANISTER_ID) {
      return Array.from(scheduleStore.values()).filter((e) => e.propertyId === propertyId);
    }
    const a = await getActor();
    return (await a.getScheduleByProperty(propertyId) as any[]).map(fromEntry);
  },

  async markCompleted(entryId: string): Promise<ScheduleEntry | null> {
    if (!MAINTENANCE_CANISTER_ID) {
      const entry = scheduleStore.get(entryId);
      if (!entry) return null;
      const updated = { ...entry, isCompleted: true };
      scheduleStore.set(entryId, updated);
      return updated;
    }
    const a = await getActor();
    const result = await a.markCompleted(entryId);
    if ("ok" in result) return fromEntry(result.ok);
    return null;
  },

  /** deleteEntry has no canister equivalent — removes from local state only. */
  deleteEntry(entryId: string): void {
    scheduleStore.delete(entryId);
  },

  /** Stream a chat message to the maintenance AI advisor. */
  async *chat(
    message: string,
    context: { yearBuilt: number; propertyAddress?: string; report?: MaintenanceReport }
  ): AsyncGenerator<string> {
    const agentUrl =
      (import.meta as any).env?.VITE_AGENT_URL ?? "http://localhost:3001";

    const res = await fetch(`${agentUrl}/api/maintenance/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Agent request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          const { text, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (text) yield text;
        } catch {
          // skip malformed SSE line
        }
      }
    }
  },

  formatCents(cents: number): string {
    return `$${Math.round(cents / 100).toLocaleString()}`;
  },

  urgencyColor(urgency: UrgencyLevel): string {
    switch (urgency) {
      case "Critical": return "#dc2626";
      case "Soon":     return "#d97706";
      case "Watch":    return "#2563eb";
      default:         return "#16a34a";
    }
  },

  urgencyBg(urgency: UrgencyLevel): string {
    switch (urgency) {
      case "Critical": return "#fef2f2";
      case "Soon":     return "#fffbeb";
      case "Watch":    return "#eff6ff";
      default:         return "#f0fdf4";
    }
  },
};
