/**
 * #712 move-in plan: read the problems a home inspector wrote up in a
 * purchase inspection report (PDF or a photo of its summary pages), so the new
 * owner can pick which become tasks. The model only lists what the report
 * says; the owner reviews every line before anything is saved.
 */

export type FindingUrgency = "safety" | "repair" | "monitor";

export interface InspectionFinding {
  title: string;
  detail: string;
  /** The part of the home, e.g. "Electrical", "Roof"; "" when the report doesn't say. */
  area: string;
  urgency: FindingUrgency;
}

export interface InspectionFindings {
  /** False when the file didn't look like an inspection report. */
  isInspectionReport: boolean;
  findings: InspectionFinding[];
}

/** Most findings returned for one file (the canister takes 25 tasks per call). */
export const MAX_FINDINGS = 25;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max).trim() : "");

function urgencyOf(raw: unknown): FindingUrgency {
  const u = typeof raw === "string" ? raw.toLowerCase() : "";
  if (u.includes("safety") || u.includes("hazard")) return "safety";
  if (u.includes("monitor")) return "monitor";
  return "repair";
}

export function normalizeFindings(raw: unknown): InspectionFindings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(obj.findings) ? obj.findings : [];
  const seen = new Set<string>();
  const findings: InspectionFinding[] = [];
  for (const item of list) {
    if (findings.length >= MAX_FINDINGS) break;
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const title = text(f.title, 120);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    findings.push({ title, detail: text(f.detail, 500), area: text(f.area, 40), urgency: urgencyOf(f.urgency) });
  }
  return { isInspectionReport: obj.isInspectionReport !== false, findings };
}

export function buildInspectionPrompt(): string {
  return `You read home inspection reports for HomeGentic, a home records app.
The user is a new homeowner who uploaded the inspection report from their purchase (a PDF, or a photo of its summary pages).
List ONLY the deficiencies, defects and recommendations the inspector has written in the report. Do not invent findings, do not add your own advice, and do not judge the home as a whole.
Respond ONLY with valid JSON, no markdown, no prose:

{
  "isInspectionReport": <true if this is a home inspection report, else false>,
  "findings": [
    {
      "title": "<short task in plain words, up to 100 characters, e.g. Repair loose flashing at chimney>",
      "detail": "<what the report says about it and where, up to 2 sentences; empty if nothing more>",
      "area": "<part of the home as the report groups it, e.g. Roof, Electrical, Plumbing, HVAC, Structure, Exterior, Interior, Appliances; empty if unclear>",
      "urgency": "<safety|repair|monitor: safety only when the report calls it a safety issue or hazard; monitor when it says to monitor or watch; otherwise repair>"
    }
  ]
}

Up to ${MAX_FINDINGS} findings, safety items first, then in report order. Merge repeats. If the report lists no deficiencies, or this is not an inspection report, return an empty list.`;
}
