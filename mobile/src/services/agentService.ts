/** Pure types and helpers for interacting with the voice-agent proxy. */
import { SESSION_HEADER } from "@homegentic/shared/agentSession";

const VOICE_AGENT_URL =
  process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:8787";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface ToolCall {
  id:    string;
  name:  string;
  input: Record<string, unknown>;
}

export type AgentResponse =
  | { type: "answer";     text: string }
  | { type: "tool_calls"; toolCalls: ToolCall[]; assistantMessage: any }
  | { type: "error";      message: string };

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function buildAgentMessage(text: string): AgentMessage {
  return { role: "user", content: text.trim() };
}

export function parseAgentResponse(raw: any): AgentResponse {
  if (!raw || typeof raw !== "object") {
    return { type: "error", message: "Empty response from agent" };
  }
  if (raw.type === "answer") {
    return { type: "answer", text: raw.text ?? "" };
  }
  if (raw.type === "tool_calls" && Array.isArray(raw.toolCalls)) {
    return {
      type:             "tool_calls",
      toolCalls:        raw.toolCalls,
      assistantMessage: raw.assistantMessage,
    };
  }
  return { type: "error", message: `Unrecognised response type: ${raw.type}` };
}

// ── Network call ──────────────────────────────────────────────────────────────

/**
 * What the voice Worker's prompt builder reads (agents/voice/types.ts
 * AgentContext). Every required field must be present or the prompt fails.
 */
export interface AgentContext {
  properties:             { id: string; address: string; city: string; state: string; zipCode: string; propertyType: string; yearBuilt: number; squareFeet: number; verificationLevel: string }[];
  recentJobs:             { id: string; serviceType: string; description: string; contractorName?: string; amount: number; status: string; date: string; warrantyMonths?: number }[];
  expiringWarranties:     { jobId: string; serviceType: string; daysRemaining: number; expiryDate: string }[];
  pendingSignatureJobIds: string[];
  openQuoteCount:         number;
  openQuoteRequests?:     { id: string; serviceType: string; description: string; urgency: string; status: string; bidCount: number; lowestBidDollars?: number }[];
  score?:                 { score: number; grade: string; breakdown: { maintenancePts: number; modernizationPts: number; verificationPts: number }; recentEvents: never[]; nextActions: string[] };
  role?:                  "Homeowner" | "Contractor";
  contractorProfile?:     { name: string; specialties: string[]; trustScore: number; jobsCompleted: number; isVerified: boolean };
  plan?:                  { tier: string; propertyLimit: number; summary: string };
  contractorSignatures?:  { serviceType: string; address: string; amountDollars: number; awaiting: "contractor" | "homeowner" }[];
  contractorEarnings?:    { month: string; jobs: { label: string; amountDollars: number; feeDollars: number }[]; feeTotalDollars: number; feeRule: string };
}

/** Header the voice Worker reads to identify the caller (see auth.issueAgentSession). */
export { SESSION_HEADER };

export async function callAgent(
  messages: AgentMessage[],
  context: AgentContext,
  sessionToken?: string | null,
): Promise<AgentResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers[SESSION_HEADER] = sessionToken;
  const res = await fetch(`${VOICE_AGENT_URL}/api/agent`, {
    method:  "POST",
    headers,
    body:    JSON.stringify({ messages, context }),
  });

  if (res.status === 429) {
    return { type: "error", message: "You've used all your AI calls for now." };
  }
  if (!res.ok) {
    return { type: "error", message: `Agent server error: ${res.status}` };
  }

  const raw = await res.json();
  return parseAgentResponse(raw);
}

// ── Usage meter ───────────────────────────────────────────────────────────────

export interface AgentUsage {
  used:   number;
  limit:  number;
  period: "day" | "week";
}

/** The caller's agent-call count this period, or null if it can't be read. */
export async function getAgentUsage(sessionToken: string | null): Promise<AgentUsage | null> {
  if (!sessionToken) return null;
  try {
    const res = await fetch(`${VOICE_AGENT_URL}/api/agent/usage`, { headers: { [SESSION_HEADER]: sessionToken } });
    if (!res.ok) return null;
    const raw = await res.json();
    return { used: Number(raw.used) || 0, limit: Number(raw.limit) || 0, period: raw.period === "week" ? "week" : "day" };
  } catch {
    return null;
  }
}

/** "10 AI CALLS A DAY · 7 LEFT TODAY" / "10 AI CALLS A WEEK ON FREE · 6 LEFT". */
export function usageMeterLabel(usage: AgentUsage, onFree: boolean): string {
  const left = Math.max(usage.limit - usage.used, 0);
  if (usage.period === "week") {
    return `${usage.limit} AI CALLS A WEEK${onFree ? " ON FREE" : ""} · ${left} LEFT`;
  }
  return `${usage.limit} AI CALLS A DAY · ${left} LEFT TODAY`;
}
