/**
 * "Show me the problem": askAboutProblem() sends the owner's description of
 * something wrong at home, and an optional photo, to the voice Worker
 * (/api/problem-help, an AI route that counts against the AI limits). The
 * answer is an AI suggestion, not a diagnosis, and the page says so. The photo
 * is only sent to the model to read; it isn't saved.
 *
 * E2E: window.__e2e_problem_help = ProblemHelp.
 */
import { voiceAgentFetch } from "./voiceAgentHeaders";
import { fileToBase64 } from "./documentOcr";
import type { Urgency } from "./quote";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

export interface ProblemHelp {
  summary: string;
  likelyCauses: string[];
  safeToTry: string[];
  shutOff: string[];
  danger: boolean;
  dangerAdvice: string;
  /** A quote form service type label, or "Other". */
  serviceType: string;
  urgency: Urgency;
}

/** The Worker takes 6 MB of JSON; base64 adds a third. */
export const MAX_PROBLEM_PHOTO_MB = 4;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function askAboutProblem(description: string, photo?: File | null): Promise<ProblemHelp> {
  const text = description.trim();
  if (!text) throw new Error("Describe what's wrong first.");
  if (photo) {
    if (!PHOTO_TYPES.includes(photo.type)) throw new Error("The photo must be a JPEG, PNG, GIF or WebP image.");
    if (photo.size > MAX_PROBLEM_PHOTO_MB * 1024 * 1024) {
      throw new Error(`That photo is over ${MAX_PROBLEM_PHOTO_MB} MB. Try a smaller one.`);
    }
  }
  const fake = typeof window !== "undefined" ? (window as any).__e2e_problem_help : undefined;
  if (fake) return fake as ProblemHelp;

  const body: Record<string, string> = { description: text };
  if (photo) {
    body.mimeType = photo.type;
    body.base64Data = await fileToBase64(photo);
  }
  const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/problem-help`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("You've reached today's limit for AI help. Try again tomorrow.");
    throw new Error("We couldn't get suggestions right now. Please try again.");
  }
  return (await res.json()) as ProblemHelp;
}

/** The quote form's prefill: this home, the suggested trade and urgency, and the owner's own words. */
export function problemQuotePrefill(propertyId: string, description: string, help: ProblemHelp) {
  return {
    propertyId,
    serviceType: help.serviceType,
    urgency: help.urgency,
    description: description.trim(),
  };
}
