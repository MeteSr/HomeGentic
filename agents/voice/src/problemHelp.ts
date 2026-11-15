/**
 * "Show me the problem": the owner describes something wrong at home (and may
 * add a photo); the model suggests likely causes, what's safe to try, what to
 * shut off, whether to get out and call for help, and which trade to ask.
 * It is an AI suggestion, never a diagnosis: the app labels it that way, and
 * one tap turns it into a quote request the owner can still edit.
 */
import { SERVICE_TYPE_LABELS, serviceTypeKey, serviceTypeLabel } from "../../../packages/shared/src/serviceTypes";

export type ProblemUrgency = "emergency" | "high" | "medium" | "low";

export interface ProblemHelp {
  summary: string;
  likelyCauses: string[];
  safeToTry: string[];
  shutOff: string[];
  /** True when the model thinks people should get out or call 911 / the utility now. */
  danger: boolean;
  dangerAdvice: string;
  /** A quote form service type label ("Plumbing", "Pest Control"), or "Other". */
  serviceType: string;
  urgency: ProblemUrgency;
}

export const MAX_DESCRIPTION_CHARS = 1000;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const DEFAULT_DANGER_ADVICE =
  "Get everyone away from the problem. If anyone is in danger, call 911; for a gas smell, call your gas company from outside.";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max).trim() : "");

function list(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (out.length >= maxItems) break;
    const t = text(item, 200);
    if (t) out.push(t);
  }
  return out;
}

function urgencyOf(raw: unknown): ProblemUrgency {
  const u = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return u === "emergency" || u === "high" || u === "low" ? u : "medium";
}

function serviceTypeOf(raw: unknown): string {
  const key = typeof raw === "string" ? serviceTypeKey(raw) : undefined;
  return key ? serviceTypeLabel(key) : "Other";
}

export function normalizeProblemHelp(raw: unknown): ProblemHelp {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const danger = obj.danger === true;
  return {
    summary: text(obj.summary, 300),
    likelyCauses: list(obj.likelyCauses, 4),
    safeToTry: list(obj.safeToTry, 5),
    shutOff: list(obj.shutOff, 3),
    danger,
    dangerAdvice: danger ? text(obj.dangerAdvice, 300) || DEFAULT_DANGER_ADVICE : "",
    serviceType: serviceTypeOf(obj.trade),
    urgency: danger ? "emergency" : urgencyOf(obj.urgency),
  };
}

/** Why a request can't be answered, or null when it can. */
export function problemHelpInputError(body: {
  description?: unknown;
  mimeType?: unknown;
  base64Data?: unknown;
}): string | null {
  const d = typeof body.description === "string" ? body.description.trim() : "";
  if (!d) return "Describe what's wrong.";
  if (d.length > MAX_DESCRIPTION_CHARS) return `Keep the description shorter than ${MAX_DESCRIPTION_CHARS} characters.`;
  if (body.mimeType !== undefined || body.base64Data !== undefined) {
    if (
      typeof body.mimeType !== "string" ||
      !PHOTO_TYPES.includes(body.mimeType) ||
      typeof body.base64Data !== "string" ||
      !body.base64Data
    ) {
      return "The photo must be a JPEG, PNG, GIF or WebP image.";
    }
  }
  return null;
}

export function buildProblemHelpPrompt(): string {
  return `You help homeowners using HomeGentic, a home records app, when something at home seems wrong.
The owner describes the problem and may add a photo. Suggest what it could be and what to do next. This is not a diagnosis: you can't see or test the home, so never say you are sure; say "may", "could" or "often".
Safety comes first. If there are signs of a gas leak (gas or rotten-egg smell, hissing near a gas line), smoke, burning smell, sparks, a hot or buzzing outlet or panel, water near electrical, carbon monoxide alarm, structural movement or a person hurt, set danger to true and tell them to get away from it and call 911 or the utility from outside.
Only suggest things a homeowner can safely do without tools or a licence (turn a valve, flip a breaker off, unplug, wipe, take photos). Never suggest opening gas lines, electrical panels or sealed appliance parts: that needs a licensed pro.
Respond ONLY with valid JSON, no markdown, no prose:

{
  "summary": "<one sentence restating the problem in plain words>",
  "likelyCauses": ["<up to 4 likely causes, most likely first, each up to 20 words>"],
  "safeToTry": ["<up to 5 safe things to check or try now, each up to 25 words; empty if nothing is safe>"],
  "shutOff": ["<up to 3 things to shut off and where they usually are, e.g. Main water valve, often where the line enters the house; empty if none>"],
  "danger": <true|false>,
  "dangerAdvice": "<if danger, what to do right now in one or two sentences; else empty>",
  "trade": "<the one trade to call, exactly one of: ${SERVICE_TYPE_LABELS.join(", ")}>",
  "urgency": "<emergency|high|medium|low: emergency = danger or ongoing damage now; high = within a few days; medium = within a few weeks; low = whenever convenient>"
}`;
}
