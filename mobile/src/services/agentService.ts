/** Pure types and helpers for interacting with the voice-agent proxy. */

const VOICE_AGENT_URL =
  process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:3001";

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

export interface AgentContext {
  properties: any[];
  recentJobs: any[];
}

export async function callAgent(
  messages: AgentMessage[],
  context: AgentContext,
): Promise<AgentResponse> {
  const res = await fetch(`${VOICE_AGENT_URL}/api/agent`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages, context }),
  });

  if (!res.ok) {
    return { type: "error", message: `Agent server error: ${res.status}` };
  }

  const raw = await res.json();
  return parseAgentResponse(raw);
}
