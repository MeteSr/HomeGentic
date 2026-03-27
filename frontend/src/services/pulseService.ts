/**
 * Home Pulse — rule-based weekly maintenance tip.
 * Returns a single actionable tip string, or null if nothing relevant applies.
 * Shown once per month (caller stores dismissal in localStorage).
 */

import type { Property } from "./property";
import type { Job } from "./job";

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
