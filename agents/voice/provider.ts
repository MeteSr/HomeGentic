/**
 * AI Provider Abstraction — interface and shared types (AI.1)
 *
 * All AI inference goes through AIProvider. No SDK-specific types
 * appear outside the concrete provider implementation.
 */

// ── Normalized types ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name:        string;
  description: string;
  parameters: {
    type:       "object";
    properties: Record<string, unknown>;
    required:   string[];
  };
}

export interface ToolCall {
  id:    string;
  name:  string;
  input: Record<string, unknown>;
}

export interface TextChunk {
  text: string;
}

export interface MessageParam {
  role:    "user" | "assistant";
  content: string | unknown[];
}

// ── Method param shapes ───────────────────────────────────────────────────────

export interface StreamParams {
  system:    string;
  messages:  MessageParam[];
  maxTokens: number;
}

export interface CompleteParams {
  system?:   string;
  messages:  MessageParam[];
  maxTokens: number;
}

export interface CompleteWithToolsParams {
  system:    string;
  messages:  MessageParam[];
  tools:     ToolDefinition[];
  maxTokens: number;
}

export type CompleteWithToolsResult =
  | { type: "answer";     text: string }
  | { type: "tool_calls"; assistantMessage: unknown; toolCalls: ToolCall[] };

// ── Provider interface ────────────────────────────────────────────────────────

export interface AIProvider {
  stream(params: StreamParams): AsyncIterable<TextChunk>;
  complete(params: CompleteParams): Promise<string>;
  completeWithTools(params: CompleteWithToolsParams): Promise<CompleteWithToolsResult>;
}

// ── AI.4: model config ────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Read model name from AI_MODEL env var, falling back to the supplied default
 *  (or the built-in default if none is given). */
export function resolveModel(fallback: string = DEFAULT_MODEL): string {
  const env = (process.env.AI_MODEL ?? "").trim();
  return env.length > 0 ? env : fallback;
}

// ── AI.6: provider-agnostic error strings ────────────────────────────────────

export const PROVIDER_JSON_ERROR = "AI provider did not return valid JSON";
