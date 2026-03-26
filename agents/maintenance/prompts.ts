import type { MaintenanceReport, SystemPrediction } from "./types";

export interface MaintenanceContext {
  yearBuilt: number;
  propertyAddress?: string;
  report?: MaintenanceReport;
}

function urgencyLabel(u: string): string {
  switch (u) {
    case "Critical": return "past expected lifespan — needs immediate attention";
    case "Soon":     return "approaching end of life — start budgeting";
    case "Watch":    return "in decent shape but worth monitoring";
    default:         return "in good shape";
  }
}

function formatUSD(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function buildSystemSummary(predictions: SystemPrediction[]): string {
  return predictions
    .map((p) => {
      const yr = p.yearsRemaining > 0
        ? `${p.yearsRemaining} year(s) remaining`
        : `${Math.abs(p.yearsRemaining)} year(s) overdue`;
      const cost = `${formatUSD(p.estimatedCostLowCents)}–${formatUSD(p.estimatedCostHighCents)}`;
      return (
        `- ${p.systemName}: ${urgencyLabel(p.urgency)}, ${yr}. ` +
        `Replacement cost ${cost}.${p.diyViable ? " DIY viable." : ""}`
      );
    })
    .join("\n");
}

export function buildMaintenanceSystemPrompt(ctx: MaintenanceContext): string {
  const houseAge = new Date().getFullYear() - ctx.yearBuilt;
  const address = ctx.propertyAddress ?? "this property";

  let reportSection = "";
  if (ctx.report) {
    const { systemPredictions, totalBudgetLowCents, totalBudgetHighCents } = ctx.report;
    const urgent = systemPredictions.filter(
      (p) => p.urgency === "Critical" || p.urgency === "Soon"
    );
    reportSection = `
Current system health for ${address} (built ${ctx.yearBuilt}, ${houseAge} years old):

${buildSystemSummary(systemPredictions)}

Urgent items (Critical or Soon): ${urgent.length === 0 ? "none" : urgent.map((p) => p.systemName).join(", ")}
Estimated budget for urgent work: ${formatUSD(totalBudgetLowCents)}–${formatUSD(totalBudgetHighCents)}
`;
  }

  return `You are the HomeFax Maintenance Advisor — a knowledgeable, practical home maintenance consultant.

Your focus areas:
- Explaining system health predictions in plain language (no jargon, no scare tactics)
- Helping homeowners prioritize repairs based on urgency and budget
- Cost ranges for repairs and replacements (2024 US national averages)
- DIY vs hire decisions: safety, skill level, permit requirements, warranty impact
- Seasonal maintenance scheduling and preventive care
- How deferred maintenance compounds costs and affects resale value
- What to ask contractors before hiring: licenses, insurance, warranties, permits
- Signs of failure: sounds, smells, symptoms to watch for in each home system

Stay grounded in practical advice. Never catastrophize. If a system is "Watch" or "Good," reassure the homeowner.
If asked about unrelated topics, politely redirect to home maintenance and property care.
${reportSection}
Response rules:
- Keep answers to 3–5 sentences unless the user asks for detail.
- Speak conversationally. No markdown, no bullet points, no headers.
- For costs, give ranges ("typically eight hundred to twelve hundred dollars") and note that local rates vary.
- If the homeowner's system data is relevant, reference it by name ("your HVAC...").
- When a system is Critical, be direct but not alarming. Give them a clear next step.`;
}
