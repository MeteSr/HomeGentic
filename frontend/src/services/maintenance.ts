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

// ─── Types ──────────────────────────────────────────────────────────────────

export type UrgencyLevel = "Critical" | "Soon" | "Watch" | "Good";

export interface SystemPrediction {
  systemName: string;
  lastServiceYear: number;
  percentLifeUsed: number;
  yearsRemaining: number;
  urgency: UrgencyLevel;
  estimatedCostLowCents: number;
  estimatedCostHighCents: number;
  recommendation: string;
  diyViable: boolean;
}

export interface AnnualTask {
  task: string;
  frequency: string;
  season: string | null;
  estimatedCost: string;
  diyViable: boolean;
}

export interface MaintenanceReport {
  systemPredictions: SystemPrediction[];
  annualTasks: AnnualTask[];
  totalBudgetLowCents: number;
  totalBudgetHighCents: number;
  generatedAt: number;
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
  diyViable: boolean;
}

const SYSTEMS: SystemSpec[] = [
  { name: "HVAC",         lifespanYears: 18, costLowCents:  800_000, costHighCents: 1_500_000, diyViable: false },
  { name: "Roofing",      lifespanYears: 25, costLowCents: 1_500_000, costHighCents: 3_500_000, diyViable: false },
  { name: "Water Heater", lifespanYears: 12, costLowCents:  120_000, costHighCents:   350_000, diyViable: false },
  { name: "Windows",      lifespanYears: 22, costLowCents:  800_000, costHighCents: 2_400_000, diyViable: false },
  { name: "Electrical",   lifespanYears: 35, costLowCents:  200_000, costHighCents:   600_000, diyViable: false },
  { name: "Plumbing",     lifespanYears: 50, costLowCents:  400_000, costHighCents: 1_500_000, diyViable: false },
  { name: "Flooring",     lifespanYears: 25, costLowCents:  300_000, costHighCents: 2_000_000, diyViable: true  },
  { name: "Insulation",   lifespanYears: 30, costLowCents:  150_000, costHighCents:   500_000, diyViable: true  },
];

const ANNUAL_TASKS: AnnualTask[] = [
  { task: "Replace HVAC air filter",            frequency: "Quarterly",     season: null,     estimatedCost: "$10–$30 (DIY)",  diyViable: true  },
  { task: "Clean gutters",                       frequency: "Semi-annually", season: "Fall",   estimatedCost: "$100–$250",       diyViable: true  },
  { task: "Clean dryer vent",                    frequency: "Annually",      season: null,     estimatedCost: "$0–$150",         diyViable: true  },
  { task: "Flush water heater",                  frequency: "Annually",      season: null,     estimatedCost: "$0 (DIY)",        diyViable: true  },
  { task: "Test smoke & CO detectors",           frequency: "Annually",      season: null,     estimatedCost: "$0 (DIY)",        diyViable: true  },
  { task: "Inspect roof for damage",             frequency: "Annually",      season: "Spring", estimatedCost: "$0–$300",         diyViable: true  },
  { task: "Check weatherstripping & caulk",      frequency: "Annually",      season: "Fall",   estimatedCost: "$20–$80 (DIY)",  diyViable: true  },
  { task: "Service garage door springs/tracks",  frequency: "Annually",      season: null,     estimatedCost: "$0–$200",         diyViable: true  },
  { task: "HVAC professional tune-up",           frequency: "Annually",      season: "Spring", estimatedCost: "$80–$150",        diyViable: false },
  { task: "Chimney inspection & cleaning",       frequency: "Annually",      season: "Fall",   estimatedCost: "$150–$350",       diyViable: false },
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
  systemInstallYears: Partial<Record<string, number>> = {}
): MaintenanceReport {
  const year = currentYear();
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

    const age        = Math.max(0, year - lastYear);
    const pctUsed    = Math.round((age / sys.lifespanYears) * 100);
    const remaining  = sys.lifespanYears - age;
    const urgency    = urgencyFor(pctUsed);

    predictions.push({
      systemName:             sys.name,
      lastServiceYear:        lastYear,
      percentLifeUsed:        pctUsed,
      yearsRemaining:         remaining,
      urgency,
      estimatedCostLowCents:  sys.costLowCents,
      estimatedCostHighCents: sys.costHighCents,
      recommendation:         recommendationFor(sys, urgency, remaining),
      diyViable:              sys.diyViable,
    });

    if (urgency === "Critical" || urgency === "Soon") {
      budgetLow  += sys.costLowCents;
      budgetHigh += sys.costHighCents;
    }
  }

  // Sort Critical → Soon → Watch → Good
  predictions.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);

  return {
    systemPredictions:    predictions,
    annualTasks:          ANNUAL_TASKS,
    totalBudgetLowCents:  budgetLow,
    totalBudgetHighCents: budgetHigh,
    generatedAt:          Date.now(),
  };
}

// ─── Mock fallback for schedule store ────────────────────────────────────────

const scheduleStore = new Map<string, ScheduleEntry>();
let scheduleCounter = 0;

export const maintenanceService = {
  predict(yearBuilt: number, jobs: Job[], systemInstallYears?: Partial<Record<string, number>>): MaintenanceReport {
    return predictMaintenance(yearBuilt, jobs, systemInstallYears);
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
