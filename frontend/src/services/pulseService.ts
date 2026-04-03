/**
 * Home Pulse — weekly maintenance digest (8.1.1) + legacy single-tip helper.
 *
 * 8.1.1: createPulseService() — structured multi-item digest, Claude-powered
 *        (falls back to deterministic mock when agent is offline).
 * Legacy: getWeeklyPulse() — single-tip rule-based function (kept for
 *         existing callers).
 */

import type { Property } from "./property";
import type { Job } from "./job";
import { climateService, type Season } from "./climateService";

const PULSE_AGENT_URL =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001")
    : "http://localhost:3001";

// ─── 8.1.1 Types ──────────────────────────────────────────────────────────────

export type PulseItemPriority = "high" | "medium" | "low";
export type PulseItemCategory =
  | "HVAC" | "Roofing" | "Plumbing" | "Electrical" | "Structural"
  | "Seasonal" | "Safety" | "Efficiency" | "General";

export interface PulseItem {
  id:       string;
  title:    string;
  body:     string;
  category: PulseItemCategory;
  priority: PulseItemPriority;
}

export interface PulseDigest {
  propertyId:  string;
  headline:    string;
  items:       PulseItem[];
  climateZone: number;
  season:      Season;
  generatedAt: number;
}

export interface PulseContext {
  propertyId:       string;
  address:          string;
  city:             string;
  state:            string;
  zipCode:          string;
  yearBuilt:        number;
  recentJobs:       Array<{ serviceType: string; date: string; amountCents: number }>;
  systemAges:       Partial<Record<string, number>>;
  userTopicWeights: Partial<Record<string, number>>;
}

// ─── System age thresholds ────────────────────────────────────────────────────

const SYSTEM_AGE_THRESHOLDS: Record<string, { high: number; medium: number }> = {
  HVAC:        { high: 12, medium: 8  },
  Roof:        { high: 20, medium: 15 },
  Plumbing:    { high: 20, medium: 12 },
  Electrical:  { high: 25, medium: 15 },
  WaterHeater: { high: 10, medium: 7  },
};

const SYSTEM_DISPLAY: Record<string, { name: string; category: PulseItemCategory }> = {
  HVAC:        { name: "HVAC system",       category: "HVAC"       },
  Roof:        { name: "roof",              category: "Roofing"    },
  Plumbing:    { name: "plumbing",          category: "Plumbing"   },
  Electrical:  { name: "electrical system", category: "Electrical" },
  WaterHeater: { name: "water heater",      category: "Plumbing"   },
};

// ─── Mock digest builder ──────────────────────────────────────────────────────

function buildMockDigest(ctx: PulseContext): PulseDigest {
  const zone     = climateService.getZone(ctx.zipCode);
  const season   = climateService.getSeason();
  const seasonal = climateService.getSeasonalPriorities(zone.zone, season);

  const items: PulseItem[] = [];
  let counter = 0;
  const itemId = () => `pulse-${++counter}`;

  for (const [system, age] of Object.entries(ctx.systemAges)) {
    if (!age) continue;
    const threshold = SYSTEM_AGE_THRESHOLDS[system];
    const display   = SYSTEM_DISPLAY[system];
    if (!threshold || !display) continue;

    const priority: PulseItemPriority =
      age >= threshold.high   ? "high"   :
      age >= threshold.medium ? "medium" : "low";
    if (priority === "low") continue;

    items.push({
      id:       itemId(),
      title:    `${display.name.charAt(0).toUpperCase() + display.name.slice(1)} ${priority === "high" ? "overdue for" : "approaching"} service`,
      body:     `Your ${display.name} is approximately ${age} years old. ${priority === "high" ? "This is past the typical service interval — schedule an inspection soon." : "Consider scheduling a service in the coming months."}`,
      category: display.category,
      priority,
    });
  }

  for (const task of seasonal.slice(0, 3)) {
    items.push({
      id:       itemId(),
      title:    task,
      body:     `Seasonal priority for ${zone.label} climate (${ctx.city}, ${ctx.state}) this ${season}.`,
      category: "Seasonal",
      priority: "medium",
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };

  if (Object.keys(ctx.userTopicWeights).length > 0) {
    items.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return (ctx.userTopicWeights[b.category] ?? 0) - (ctx.userTopicWeights[a.category] ?? 0);
    });
  } else {
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  const homeAge = new Date().getFullYear() - ctx.yearBuilt;
  const headline =
    items.some((i) => i.priority === "high")
      ? `Your ${homeAge}-year-old home has items that need attention this ${season}.`
      : `Your home is in good shape — here's what to keep an eye on this ${season}.`;

  return { propertyId: ctx.propertyId, headline, items, climateZone: zone.zone, season, generatedAt: Date.now() };
}

// ─── 8.1.1 Factory ───────────────────────────────────────────────────────────

export function createPulseService() {
  const cache = new Map<string, PulseDigest>();

  async function generateDigest(ctx: PulseContext): Promise<PulseDigest> {
    try {
      const res = await fetch(`${PULSE_AGENT_URL}/api/pulse`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(ctx),
        signal:  AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const digest: PulseDigest = await res.json();
        cache.set(ctx.propertyId, digest);
        return digest;
      }
    } catch { /* agent offline → fall through */ }

    const digest = buildMockDigest(ctx);
    cache.set(ctx.propertyId, digest);
    return digest;
  }

  function getCachedDigest(propertyId: string): PulseDigest | null {
    return cache.get(propertyId) ?? null;
  }

  return { generateDigest, getCachedDigest };
}

export const pulseService = createPulseService();

interface PulseTip {
  headline: string;
  detail:   string;
  category: string; // e.g. "Seasonal", "Overdue", "Milestone"
}

const MONTH_TIPS: Record<number, { headline: string; detail: string; category: string }> = {
  1:  { headline: "Check your heating system filters",      detail: "Mid-winter is the peak load month. A clogged filter raises energy bills 5–15%.",                         category: "Seasonal" },
  2:  { headline: "Inspect attic insulation",               detail: "Ice dams form when heat escapes the roof. Confirm insulation is 10–14\" deep.",                          category: "Seasonal" },
  3:  { headline: "Schedule a roof inspection",             detail: "Spring thaw reveals winter damage before it becomes a leak. Book a roofer in March before the rush.",      category: "Seasonal" },
  4:  { headline: "Service your AC before summer",          detail: "HVAC tune-ups booked in April cost 20% less than June emergency calls.",                                  category: "Seasonal" },
  5:  { headline: "Flush your water heater",                detail: "Sediment buildup reduces efficiency by up to 30%. A 20-minute flush extends tank life 3–5 years.",        category: "Overdue" },
  6:  { headline: "Clean dryer vents",                      detail: "Clogged dryer vents are a leading cause of house fires. Clean the full duct run annually.",               category: "Safety" },
  7:  { headline: "Caulk windows and exterior gaps",        detail: "Summer humidity reveals gaps that will let cold air in come winter. Seal now while it's warm.",            category: "Seasonal" },
  8:  { headline: "Test smoke and CO detectors",            detail: "Replace batteries and test all detectors. Detectors over 10 years old should be replaced entirely.",       category: "Safety" },
  9:  { headline: "Drain and winterize irrigation",         detail: "Frozen pipes in irrigation systems cost $1,000–$4,000 to repair. Blow out lines before first frost.",    category: "Seasonal" },
  10: { headline: "Chimney inspection before heating season", detail: "Creosote buildup in flues is a fire hazard. Schedule a sweep before you light the first fire.",         category: "Safety" },
  11: { headline: "Insulate exposed pipes",                 detail: "Pipes in unheated spaces are at risk below 20°F. Foam pipe insulation costs $1–$3/ft.",                   category: "Seasonal" },
  12: { headline: "Reverse ceiling fans for winter",        detail: "Clockwise rotation at low speed pushes warm air down, cutting heating costs up to 10%.",                  category: "Seasonal" },
};

/**
 * Returns a tip relevant to this month + property state.
 * Priority: overdue service detection → seasonal tip.
 */
export function getWeeklyPulse(properties: Property[], jobs: Job[]): PulseTip | null {
  if (properties.length === 0) return null;

  const month = new Date().getMonth() + 1; // 1–12
  const now   = Date.now();

  // Detect overdue service types (no matching job in last 12 months)
  const ANNUAL_SERVICES = [
    { type: "HVAC",            tip: "Your HVAC hasn't been serviced in over a year. A tune-up prevents costly breakdowns.",                          headline: "HVAC service overdue" },
    { type: "Plumbing",        tip: "A plumbing inspection can catch slow leaks that cause mold. Schedule one annually.",                            headline: "Plumbing check overdue" },
    { type: "Electrical",      tip: "Electrical panels should be inspected every 3–5 years. Overloaded circuits are a fire risk.",                   headline: "Electrical inspection due" },
    { type: "Roof",            tip: "Roof inspections every 1–3 years catch flashing issues before they become leaks.",                             headline: "Roof inspection due" },
  ];

  for (const svc of ANNUAL_SERVICES) {
    const lastJob = jobs
      .filter((j) => j.serviceType.toLowerCase().includes(svc.type.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const overdue   = !lastJob || (now - new Date(lastJob.date).getTime()) > msPerYear;

    if (overdue) {
      return { headline: svc.headline, detail: svc.tip, category: "Overdue" };
    }
  }

  // Fall back to seasonal month tip
  return MONTH_TIPS[month] ?? null;
}
